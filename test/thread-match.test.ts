import { describe, expect, it } from "vitest";
import { idlePill, matchThread, toneFor, windowAppliesToModel } from "../src/thread-match";
import type { AccountNode, Limit, ProviderNode } from "../src/types";

const NOW = new Date("2026-11-01T12:00:00Z");
const FRESH = "2026-11-01T11:55:00Z";
const CATALOG = ["claude-fable-5-1", "claude-opus-5-5"];

const win = (label: string, p: number, extra: Partial<Extract<Limit, { kind: "window" }>> = {}): Limit => ({
  kind: "window", id: label, label, remainingPercent: p, resetsAt: null, model: null, ...extra,
});
const account = (limits: Limit[], o: Partial<AccountNode> = {}): AccountNode => ({
  key: "a", label: null, planLabel: null, devices: [{ hostId: "vps-1", name: "VM" }],
  status: "ok", message: null, offline: false, limits, fetchedAt: FRESH, ...o,
});
const prov = (providerId: string, name: string, accounts: AccountNode[]): ProviderNode => ({
  providerId, name, accounts, hints: [],
});
const chat = (model: string | null, providerId = "claude-code", hostId: string | null = "vps-1") => ({
  providerId, model, hostId,
});

describe("windowAppliesToModel", () => {
  it("classifies windows", () => {
    expect(windowAppliesToModel("Fable", "claude-fable-5-1", CATALOG)).toBe("model");
    expect(windowAppliesToModel("Opus", "claude-fable-5-1", CATALOG)).toBe("other-model");
    expect(windowAppliesToModel("Current session", "claude-fable-5-1", CATALOG)).toBe("account");
    expect(windowAppliesToModel("Fab", "claude-fable-5-1", CATALOG)).toBe("account");
  });
});

describe("toneFor", () => {
  it("uses thresholds", () => {
    expect(toneFor(31)).toBe("good");
    expect(toneFor(30)).toBe("warn");
    expect(toneFor(11)).toBe("warn");
    expect(toneFor(10)).toBe("bad");
  });
});

describe("matchThread", () => {
  const tree = [prov("claude-code", "Claude Code", [
    account([win("Сессия", 64), win("Неделя", 72), win("Fable", 41), win("Opus", 5)]),
  ])];

  it("takes the minimum of account and model windows", () => {
    const v = matchThread(chat("claude-fable-5-1"), tree, CATALOG, NOW);
    expect(v.percent).toBe(41);
    expect(v.tone).toBe("good");
    expect(v.text).toBe("59%");
    expect(v.limitLabel).toBe("Fable");
    expect(v.limits.map((l) => l.label)).toEqual(["Сессия", "Неделя", "Fable"]);
    expect(v.providerName).toBe("Claude Code");
    expect(v.deviceName).toBe("VM");
    expect(v.model).toBe("claude-fable-5-1");
  });

  it("ignores windows whose explicit model differs", () => {
    const t = [prov("claude-code", "C", [account([win("X", 5, { model: "other" }), win("Y", 50)])])];
    expect(matchThread(chat("m1"), t, [], NOW).percent).toBe(50);
    const t2 = [prov("claude-code", "C", [account([win("X", 5, { model: "M1" }), win("Y", 50)])])];
    expect(matchThread(chat("m1"), t2, [], NOW).percent).toBe(5);
  });

  it("no data when device does not match", () => {
    const v = matchThread(chat("claude-fable-5-1", "claude-code", "other"), tree, CATALOG, NOW);
    expect(v.text).toBe("нет данных");
    expect(v.tone).toBe("muted");
    expect(v.percent).toBeNull();
  });

  it("maps Pi kimi to a single Kimi account", () => {
    const k = (n: string) => account([win("W", 60)], { key: n });
    const one = [prov("kimi-code", "Kimi", [k("1")])];
    expect(matchThread(chat("kimi-k3", "pi", null), one, [], NOW).text).toBe("40%");
    const two = [prov("kimi-code", "Kimi", [k("1"), k("2")])];
    expect(matchThread(chat("kimi-k3", "pi", null), two, [], NOW).text).toBe("нет данных");
  });

  it("Pi with unknown model has no data", () => {
    const v = matchThread(chat("mystery-model-1", "pi"), tree, [], NOW);
    expect(v.text).toBe("нет данных");
    expect(v.tone).toBe("muted");
  });

  it("shows balance when no windows", () => {
    const t = [prov("claude-code", "C", [account([
      { kind: "balance", id: "b", label: "Баланс", amount: 12.4, currency: "USD", model: null },
    ])])];
    const v = matchThread(chat("m"), t, [], NOW);
    expect(v.text).toBe("12,40 USD");
    expect(v.percent).toBeNull();
    expect(v.tone).toBe("muted");
  });

  it("marks stale data", () => {
    const t = [prov("claude-code", "C", [account([win("W", 64)], { fetchedAt: "2026-11-01T10:00:00Z" })])];
    const v = matchThread(chat("m"), t, [], NOW);
    expect(v.stale).toBe(true);
    expect(v.tone).toBe("muted");
    expect(v.percent).toBe(64);
    expect(v.text).toContain("⚠");
  });

  it("prefers non-stale windows", () => {
    const t = [prov("claude-code", "C", [account([
      win("Old", 3, { resetsAt: "2026-11-01T11:00:00Z" }), win("New", 70),
    ])])];
    const v = matchThread(chat("m"), t, [], NOW);
    expect(v.percent).toBe(70);
    expect(v.stale).toBe(false);
  });
});

describe("idlePill", () => {
  it("empty tree", () => {
    const v = idlePill([], NOW);
    expect(v.text).toBe("нет данных");
    expect(v.tone).toBe("muted");
    expect(v.percent).toBeNull();
    expect(v.model).toBeNull();
  });
  it("minimum window", () => {
    const v = idlePill([prov("a", "A", [account([win("W", 20)])]), prov("b", "B", [account([win("W", 9.6)])])], NOW);
    expect(v.text).toBe("90%");
    expect(v.providerName).toBe("B");
    expect(v.tone).toBe("bad");
  });
});

import { resolveProviderId as rpi } from "../src/thread-match";
describe("resolveProviderId", () => {
  const r = (providerId: string, model: string | null) => rpi({ providerId, model, hostId: null });
  it("resolves direct, pi prefixes and unknown", () => {
    expect(r("codex", null)).toEqual({ id: "codex", viaPi: false });
    expect(r("pi", "kimi-k2")?.id).toBe("kimi-code");
    expect(r("pi", "GLM-4.6")?.id).toBe("GLM");
    expect(r("pi", "claude-opus")?.id).toBe("claude-code");
    expect(r("pi", "gpt-5")).toBeNull();
    expect(r("pi", null)).toBeNull();
  });
});

import { modelFromEvents } from "../src/thread-match";
describe("modelFromEvents", () => {
  const ev = (seq: number, model?: unknown) => ({ seq, data: model === undefined ? {} : { execution: { model } } });
  it("picks the highest seq with a model", () => {
    expect(modelFromEvents([ev(3, "a"), ev(9, "b"), ev(5, "c")])).toBe("b");
  });
  it("skips rows without a model", () => {
    expect(modelFromEvents([ev(9), ev(8, ""), ev(7, 5), ev(4, "x")])).toBe("x");
  });
  it("returns null when empty", () => {
    expect(modelFromEvents([])).toBeNull();
    expect(modelFromEvents([ev(1)])).toBeNull();
  });
});

describe("model window matching", () => {
  const FABLE = "claude-fable-5-1";
  const input = (model: string | null) => ({ providerId: "claude-code", model, hostId: "vps-1" });
  const tree = (limits: Limit[]): ProviderNode[] => [
    { providerId: "claude-code", name: "Claude", accounts: [account(limits)] } as ProviderNode,
  ];
  const applies = (windowModel: string, chat: string | null) =>
    matchThread(input(chat), tree([win("W", 10, { model: windowModel })]), CATALOG, NOW).limits.length === 1;
  it("matches a whole segment", () => {
    expect(applies("fable", FABLE)).toBe(true);
    expect(applies("Fable", FABLE)).toBe(true);
  });
  it("rejects other models and partial segments", () => {
    expect(applies("fable", "claude-opus-5-5")).toBe(false);
    expect(applies("fab", FABLE)).toBe(false);
  });
  it("keeps exact full id", () => {
    expect(applies(FABLE, FABLE)).toBe(true);
  });
  it("excludes with null chat model", () => {
    expect(applies("fable", null)).toBe(false);
  });
  it("uses the Fable window for a Fable chat", () => {
    const t = tree([win("Current session", 63), win("Fable", 41, { model: "fable" })]);
    expect(matchThread(input(FABLE), t, CATALOG, NOW).percent).toBe(41);
  });
});
