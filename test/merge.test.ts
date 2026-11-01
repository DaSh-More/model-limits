import { describe, expect, it } from "vitest";
import { accountKey, merge } from "../src/merge";
import type { AccountReading, Limit } from "../src/types";

const none = { hidden: [], names: {} };
const win = (p: number): Limit => ({
  kind: "window", id: "w", label: "5h", remainingPercent: p, resetsAt: null, model: null,
});
function r(over: Partial<AccountReading> = {}): AccountReading {
  return {
    sourceId: "s1", providerId: "claude-code", accountIdentity: "a@x", accountLabel: "A",
    planLabel: null, device: { hostId: "h1", name: "vm" }, status: "ok", message: null,
    offline: false, limits: [win(50)], fetchedAt: "2026-11-01T10:00:00Z", ...over,
  };
}
const noAuth = (over: Partial<AccountReading> = {}) =>
  r({ accountIdentity: null, accountLabel: null, status: "unauthenticated", limits: [], ...over });

describe("accountKey", () => {
  it("uses identity, host or source", () => {
    expect(accountKey(r())).toBe("claude-code|a@x");
    expect(accountKey(r({ accountIdentity: null }))).toBe("claude-code|host:h1");
    expect(accountKey(r({ accountIdentity: null, device: { service: true } }))).toBe("claude-code|source:s1");
  });
});

describe("merge", () => {
  it("same accountKey on two hosts merges, newest wins", () => {
    const out = merge([
      r({ limits: [win(10)], fetchedAt: "2026-11-01T09:00:00Z" }),
      r({ device: { hostId: "h2", name: "arch" }, limits: [win(70)], fetchedAt: "2026-11-01T11:00:00Z" }),
    ], none);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Claude Code");
    expect(out[0].accounts).toHaveLength(1);
    expect(out[0].accounts[0].devices).toHaveLength(2);
    expect(out[0].accounts[0].limits).toEqual([win(70)]);
  });
  it("different accountKey gives two accounts", () => {
    const out = merge([r(), r({ accountIdentity: "b@x" })], none);
    expect(out[0].accounts.map((a) => a.key)).toEqual(["claude-code|a@x", "claude-code|b@x"]);
  });
  it("kimi without identity gives account per machine", () => {
    const k = { providerId: "kimi-code", accountIdentity: null };
    const out = merge([r({ ...k }), r({ ...k, device: { hostId: "h2", name: "arch" } })], none);
    expect(out[0].name).toBe("Kimi Code");
    expect(out[0].accounts).toHaveLength(2);
  });
  it("unauthenticated with another account becomes hint", () => {
    const out = merge([r(), noAuth({ device: { hostId: "h2", name: "server-1" } })], none);
    expect(out[0].hints).toEqual([{ text: "На server-1 не выполнен вход", hostId: "h2" }]);
    expect(out[0].accounts).toHaveLength(1);
  });
  it("service-device login-only reading yields no hint", () => {
    const out = merge([r(), noAuth({ device: { service: true } })], none);
    expect(out[0].hints).toEqual([]);
  });
  it("unauthenticated alone becomes status row; one per device", () => {
    const out = merge([noAuth(), noAuth({ device: { hostId: "h2", name: "arch" } })], none);
    expect(out[0].hints).toEqual([]);
    expect(out[0].accounts).toHaveLength(2);
    expect(out[0].accounts[0].status).toBe("unauthenticated");
    expect(out[0].accounts[0].limits).toEqual([]);
  });
  it("expired with retained limits stays account row", () => {
    const out = merge([r(), r({ accountIdentity: null, status: "expired", device: { hostId: "h2", name: "arch" } })], none);
    expect(out[0].hints).toEqual([]);
    expect(out[0].accounts[1].status).toBe("expired");
  });
  it("not_installed is dropped", () => {
    expect(merge([r({ status: "not_installed", limits: [] })], none)).toEqual([]);
  });
  it("ok without limits is kept", () => {
    const out = merge([r({ limits: [] })], none);
    expect(out[0].accounts[0]).toMatchObject({ status: "ok", limits: [] });
  });
  it("hidden account, provider, device", () => {
    const rs = [r(), r({ accountIdentity: "b@x" })];
    expect(merge(rs, { hidden: ["claude-code|a@x"], names: {} })[0].accounts).toHaveLength(1);
    expect(merge(rs, { hidden: ["claude-code"], names: {} })).toEqual([]);
    const dev = merge(
      [r(), r({ device: { hostId: "h2", name: "arch" } }), noAuth({ device: { hostId: "h3", name: "old" } })],
      { hidden: ["claude-code|device:h2", "claude-code|device:h3"], names: {} },
    );
    expect(dev[0].accounts[0].devices).toEqual([{ hostId: "h1", name: "vm" }]);
    expect(dev[0].hints).toEqual([]);
  });
  it("names override label", () => {
    const out = merge([r()], { hidden: [], names: { "claude-code|a@x": "Work" } });
    expect(out[0].accounts[0].label).toBe("Work");
  });
  it("keeps first-seen order, passes unknown provider names, service device", () => {
    const out = merge([
      r({ providerId: "DeepSeek", device: { service: true }, accountIdentity: null }),
      r({ providerId: "codex" }),
      r({ providerId: "DeepSeek", sourceId: "s2", accountIdentity: "z", device: { service: true } }),
    ], none);
    expect(out.map((p) => p.name)).toEqual(["DeepSeek", "Codex"]);
    expect(out[0].accounts[0].devices).toEqual([{ service: true }]);
  });
});
