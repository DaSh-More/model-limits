import { describe, expect, it } from "vitest";
import { isStale, summarize } from "../src/summary";
import type { AccountNode, Limit, ProviderNode } from "../src/types";

const now = new Date("2026-11-01T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
const win = (p: number, resetsAt: string | null = null, label = "5h"): Limit => ({
  kind: "window", id: label, label, remainingPercent: p, resetsAt, model: null,
});
const bal: Limit = { kind: "balance", id: "b", label: "Баланс", amount: 1, currency: "USD", model: null };
function acc(over: Partial<AccountNode> = {}): AccountNode {
  return {
    key: "k", label: null, planLabel: null, devices: [{ hostId: "h1", name: "vm" }],
    status: "ok", message: null, offline: false, limits: [win(50)], fetchedAt: ago(1), ...over,
  };
}
const prov = (accounts: AccountNode[], name = "Claude"): ProviderNode => ({
  providerId: "p", name, accounts, hints: [],
});

describe("isStale", () => {
  it("29 min fresh, 31 stale, exactly 30 fresh", () => {
    expect(isStale(win(5), ago(29), now)).toBe(false);
    expect(isStale(win(5), ago(31), now)).toBe(true);
    expect(isStale(win(5), ago(30), now)).toBe(false);
  });
  it("window with past resetsAt is stale", () => {
    expect(isStale(win(5, ago(1)), ago(1), now)).toBe(true);
    expect(isStale(win(5, new Date(now.getTime() + 60000).toISOString()), ago(1), now)).toBe(false);
  });
  it("balance depends only on fetchedAt", () => {
    expect(isStale(bal, ago(29), now)).toBe(false);
    expect(isStale(bal, ago(31), now)).toBe(true);
  });
});

describe("summarize", () => {
  it("empty tree", () => {
    expect(summarize([], now)).toEqual({ minimum: null, nextResetAt: null, accountCount: 0, deviceCount: 0 });
  });
  it("minimum skips balances, stale windows, unauthenticated", () => {
    const s = summarize([
      prov([
        acc({ limits: [bal, win(40, null, "week")] }),
        acc({ limits: [win(3)], fetchedAt: ago(31) }),
        acc({ limits: [win(2, ago(5))] }),
        acc({ status: "unauthenticated", limits: [win(1)] }),
      ]),
    ], now);
    expect(s.minimum).toEqual({ providerName: "Claude", label: "week", remainingPercent: 40 });
  });
  it("source error with fresh data counts; expired with limits counts", () => {
    const s = summarize([
      prov([acc({ status: "error", limits: [win(20)] }), acc({ status: "expired", limits: [win(7, null, "x")] })], "Kimi"),
    ], now);
    expect(s.minimum).toEqual({ providerName: "Kimi", label: "x", remainingPercent: 7 });
  });
  it("nextResetAt is earliest future reset among counted non-stale windows", () => {
    const a = new Date(now.getTime() + 3600000).toISOString();
    const b = new Date(now.getTime() + 600000).toISOString();
    const c = new Date(now.getTime() + 60000).toISOString();
    const s = summarize([
      prov([
        acc({ limits: [win(50, a), win(60, b)] }),
        acc({ status: "unauthenticated", limits: [win(1, c)] }),
        acc({ limits: [win(1, c)], fetchedAt: ago(40) }),
      ]),
    ], now);
    expect(s.nextResetAt).toBe(b);
  });
  it("counts accounts including status rows and unique machines excluding service", () => {
    const s = summarize([
      prov([
        acc({ devices: [{ hostId: "h1", name: "a" }, { service: true }] }),
        acc({ devices: [{ hostId: "h1", name: "a" }, { hostId: "h2", name: "b" }] }),
        acc({ status: "unauthenticated", limits: [], devices: [{ hostId: "h3", name: "c" }] }),
      ]),
      prov([acc({ devices: [{ service: true }] })], "D"),
    ], now);
    expect(s.accountCount).toBe(4);
    expect(s.deviceCount).toBe(3);
  });
  it("all-stale gives null minimum", () => {
    const s = summarize([prov([acc({ fetchedAt: ago(60) })])], now);
    expect(s.minimum).toBeNull();
    expect(s.nextResetAt).toBeNull();
  });
});
