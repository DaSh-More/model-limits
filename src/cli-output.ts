import type { Summary } from "./summary";
import type { AccountNode, Limit, ProviderNode } from "./types";

const fmtMoney = (n: number, c: string) => `${n.toFixed(2).replace(".", ",")} ${c}`;

function limitLine(l: Limit): string {
  if (l.kind === "balance") return `  ${l.label}: ${fmtMoney(l.amount, l.currency)}`;
  const reset = l.resetsAt ? `, сброс ${l.resetsAt}` : "";
  return `  ${l.label}: ${Math.round(l.remainingPercent)}% осталось${reset}`;
}

function accountLines(a: AccountNode): string[] {
  const title = [a.label, a.planLabel].filter(Boolean).join(" · ") || "аккаунт";
  const devices = a.devices.map((d) => ("name" in d ? d.name : "сервис")).join(", ");
  const flags = [a.offline ? "не в сети" : null, a.status !== "ok" ? a.status : null, a.message].filter(Boolean);
  const out = [` ${title}${devices ? ` [${devices}]` : ""}${flags.length ? ` (${flags.join("; ")})` : ""}`];
  for (const l of a.limits) out.push(limitLine(l));
  return out;
}

export function renderSummaryText(tree: ProviderNode[], summary: Summary): string {
  if (tree.length === 0) return "Нет данных о лимитах.\n";
  const lines: string[] = [];
  for (const p of tree) {
    lines.push(p.name);
    for (const a of p.accounts) lines.push(...accountLines(a));
    for (const h of p.hints) lines.push(` ${h}`);
  }
  lines.push("");
  const min = summary.minimum;
  lines.push(
    min
      ? `Минимум: ${min.providerName} ${min.label} ${Math.round(min.remainingPercent)}%`
      : "Минимум: нет данных",
  );
  lines.push(`Аккаунтов: ${summary.accountCount}, устройств: ${summary.deviceCount}`);
  return lines.join("\n") + "\n";
}

const pickLimit = (l: Limit) =>
  l.kind === "window"
    ? { kind: l.kind, id: l.id, label: l.label, remainingPercent: l.remainingPercent, resetsAt: l.resetsAt, model: l.model }
    : { kind: l.kind, id: l.id, label: l.label, amount: l.amount, currency: l.currency, model: l.model };

const pickAccount = (a: AccountNode) => ({
  label: a.label,
  planLabel: a.planLabel,
  devices: a.devices.map((d) => ("hostId" in d ? { hostId: d.hostId, name: d.name } : { service: true })),
  status: a.status,
  message: a.message,
  offline: a.offline,
  fetchedAt: a.fetchedAt,
  limits: a.limits.map(pickLimit),
});

const pickProvider = (p: ProviderNode) => ({
  providerId: p.providerId,
  name: p.name,
  hints: [...p.hints],
  accounts: p.accounts.map(pickAccount),
});

const pickSummary = (s: Summary) => ({
  minimum: s.minimum
    ? { providerName: s.minimum.providerName, label: s.minimum.label, remainingPercent: s.minimum.remainingPercent }
    : null,
  nextResetAt: s.nextResetAt,
  accountCount: s.accountCount,
  deviceCount: s.deviceCount,
});

const bytes = (s: string) => new TextEncoder().encode(s).length;

export function renderJson(tree: ProviderNode[], summary: Summary, maxBytes: number): string {
  const providers = tree.map(pickProvider);
  const sum = pickSummary(summary);
  const full = JSON.stringify({ truncated: false, summary: sum, tree: providers });
  if (bytes(full) <= maxBytes) return full;
  for (let n = providers.length - 1; n >= 0; n--) {
    const s = JSON.stringify({ truncated: true, summary: sum, tree: providers.slice(0, n) });
    if (bytes(s) <= maxBytes) return s;
  }
  const bare = JSON.stringify({ truncated: true });
  return bytes(bare) <= maxBytes ? bare : "";
}
