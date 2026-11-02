import { isStale, summarize } from "./summary";
import type { AccountNode, Device, Limit, ProviderNode } from "./types";

export interface ThreadInput {
  providerId: string;
  model: string | null;
  hostId: string | null;
}

export interface PillView {
  /** The chat's model has a limit of its own, separate from the account's. */
  hasModelLimit?: boolean;
  /** The limit the shown value comes from, e.g. "Current session". */
  limitLabel?: string | null;
  model: string | null;
  text: string;
  percent: number | null;
  tone: "good" | "warn" | "bad" | "muted";
  stale: boolean;
  limits: Limit[];
  providerName: string | null;
  deviceName: string | null;
  fetchedAt: string | null;
}

const NO_DATA = "нет данных";
const PI_PROVIDER_ID = "pi";
const PI_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["kimi", "kimi-code"],
  ["glm", "GLM"],
  ["claude", "claude-code"],
];

function segments(model: string): string[] {
  return model.toLowerCase().split("-").filter(Boolean);
}

function modelWindowMatches(windowModel: string, chatModel: string): boolean {
  const w = windowModel.toLowerCase();
  return w === chatModel.toLowerCase() || segments(chatModel).includes(w);
}

export function modelFromEvents(
  events: ReadonlyArray<{ seq: number; data: unknown }>,
): string | null {
  let best = -Infinity;
  let model: string | null = null;
  for (const e of events) {
    const m = (e.data as { execution?: { model?: unknown } } | null)?.execution?.model;
    if (typeof m === "string" && m !== "" && e.seq > best) {
      best = e.seq;
      model = m;
    }
  }
  return model;
}

export function windowAppliesToModel(
  label: string,
  model: string,
  catalog: string[],
): "model" | "other-model" | "account" {
  const l = label.trim().toLowerCase();
  if (segments(model).includes(l)) return "model";
  if (catalog.some((m) => segments(m).includes(l))) return "other-model";
  return "account";
}

export function toneFor(percent: number): "good" | "warn" | "bad" {
  if (percent > 30) return "good";
  if (percent > 10) return "warn";
  return "bad";
}

function noData(input: ThreadInput, providerName: string | null = null): PillView {
  return {
    limitLabel: null, model: input.model, text: NO_DATA, percent: null, tone: "muted", stale: false,
    limits: [], providerName, deviceName: null, fetchedAt: null,
  };
}

function formatBalance(amount: number, currency: string): string {
  return `${amount.toFixed(2).replace(".", ",")} ${currency}`;
}

export function resolveProviderId(input: ThreadInput): { id: string; viaPi: boolean } | null {
  if (input.providerId !== PI_PROVIDER_ID) return { id: input.providerId, viaPi: false };
  const model = (input.model ?? "").toLowerCase();
  for (const [prefix, id] of PI_PREFIXES) if (model.startsWith(prefix)) return { id, viaPi: true };
  return null;
}

function deviceOf(account: AccountNode, hostId: string | null): Extract<Device, { hostId: string }> | null {
  for (const d of account.devices) if ("hostId" in d && d.hostId === hostId) return d;
  return null;
}

export function matchThread(
  input: ThreadInput,
  tree: ProviderNode[],
  catalog: string[],
  now: Date,
): PillView {
  const resolved = resolveProviderId(input);
  if (!resolved) return noData(input);
  const provider = tree.find((p) => p.providerId === resolved.id);
  if (!provider) return noData(input);

  let account: AccountNode | undefined;
  if (resolved.viaPi) {
    if (provider.accounts.length === 1) account = provider.accounts[0];
  } else {
    account = provider.accounts.find((a) => deviceOf(a, input.hostId) !== null);
  }
  if (!account) return noData(input, provider.name);
  const deviceName = deviceOf(account, input.hostId)?.name ?? null;

  const chatModel = input.model;
  const considered = account.limits.filter((l) => {
    if (l.kind === "balance") return true;
    if (l.model !== null) return chatModel !== null && modelWindowMatches(l.model, chatModel);
    if (chatModel === null) return true;
    return windowAppliesToModel(l.label, chatModel, catalog) !== "other-model";
  });

  const base = {
    model: input.model, limits: considered, providerName: provider.name,
    deviceName, fetchedAt: account.fetchedAt,
  };

  const windows = considered.filter((l): l is Extract<Limit, { kind: "window" }> => l.kind === "window");
  const hasModelLimit = windows.some(
    (w) => w.model !== null || (chatModel !== null && windowAppliesToModel(w.label, chatModel, catalog) === "model"),
  );
  if (windows.length > 0) {
    const fresh = windows.filter((w) => !isStale(w, account.fetchedAt, now));
    const pool = fresh.length > 0 ? fresh : windows;
    const min = pool.reduce((a, b) => (b.remainingPercent < a.remainingPercent ? b : a));
    const stale = fresh.length === 0;
    const percent = Math.round(min.remainingPercent);
    const used = 100 - percent;
    return {
      ...base,
      hasModelLimit,
      limitLabel: min.label,
      text: stale ? `${used}% ⚠` : `${used}%`,
      percent,
      tone: stale ? "muted" : toneFor(percent),
      stale,
    };
  }

  const balance = considered.find((l) => l.kind === "balance");
  if (balance && balance.kind === "balance") {
    const stale = isStale(balance, account.fetchedAt, now);
    const text = formatBalance(balance.amount, balance.currency);
    return { ...base, limitLabel: balance.label, text: stale ? `${text} ⚠` : text, percent: null, tone: "muted", stale };
  }

  return { ...noData(input, provider.name), deviceName };
}

/** Header name: the provider, unless the model has its own limit. */
export function headerLabel(view: Pick<PillView, "model" | "providerName" | "hasModelLimit">): string {
  if (view.hasModelLimit && view.model) return view.model;
  return view.providerName ?? view.model ?? "Лимит";
}

export function idlePill(tree: ProviderNode[], now: Date): PillView {
  const min = summarize(tree, now).minimum;
  if (!min) {
    return {
      model: null, text: NO_DATA, percent: null, tone: "muted", stale: false,
      limits: [], providerName: null, deviceName: null, fetchedAt: null,
    };
  }
  const percent = Math.round(min.remainingPercent);
  let fetchedAt: string | null = null;
  let limits: Limit[] = [];
  for (const p of tree) {
    if (p.name !== min.providerName) continue;
    for (const a of p.accounts) {
      if (a.limits.some((l) => l.kind === "window" && l.label === min.label && l.remainingPercent === min.remainingPercent)) {
        fetchedAt = a.fetchedAt;
        limits = a.limits;
      }
    }
  }
  return {
    model: null, limitLabel: min.label, text: `${100 - percent}%`, percent, tone: toneFor(percent), stale: false,
    limits, providerName: min.providerName, deviceName: null, fetchedAt,
  };
}
