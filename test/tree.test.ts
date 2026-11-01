import { describe, expect, it } from "vitest";
import { accountKey } from "../src/merge";
import { idlePill } from "../src/thread-match";
import { buildDiscoveredTree, buildPillTrees, buildStoredTree } from "../src/tree";
import type { AccountReading } from "../src/types";

const reading: AccountReading = {
  sourceId: "bb", providerId: "claude-code", accountIdentity: "a@x", accountLabel: "A", planLabel: null,
  device: { hostId: "h1", name: "vm" }, status: "ok", message: null, offline: false,
  limits: [{ kind: "window", id: "w", label: "5h", remainingPercent: 50, resetsAt: null, model: null }],
  fetchedAt: "2026-11-01T10:00:00Z",
};

describe("tree builders", () => {
  const key = accountKey(reading);
  const overrides = { hidden: [key], names: { [key]: "Мой" } };
  it("stored tree applies hiding", () => {
    expect(buildStoredTree([reading], overrides)).toEqual([]);
  });
  it("discovered tree ignores hiding but keeps names", () => {
    const t = buildDiscoveredTree([reading], overrides);
    expect(t).toHaveLength(1);
    expect(t[0].accounts[0].label).toBe("Мой");
  });
  it("hidden provider is absent from stored, present in discovered", () => {
    const o = { hidden: ["claude-code"], names: {} };
    expect(buildStoredTree([reading], o)).toHaveLength(0);
    expect(buildDiscoveredTree([reading], o)).toHaveLength(1);
  });
});

describe("device sign-in hint hiding", () => {
  const ok = reading;
  const noAuth: AccountReading = {
    ...reading, accountIdentity: null, accountLabel: null, status: "unauthenticated", limits: [],
    device: { hostId: "h2", name: "server-1" },
  };
  const overrides = { hidden: ["claude-code|device:h2"], names: {} };
  it("stored tree drops the hint, discovered tree keeps it", () => {
    expect(buildStoredTree([ok, noAuth], overrides)[0].hints).toEqual([]);
    expect(buildDiscoveredTree([ok, noAuth], overrides)[0].hints).toEqual([
      { text: "На server-1 не выполнен вход", hostId: "h2" },
    ]);
  });
});

describe("buildPillTrees", () => {
  it("idle pill ignores hidden providers, matching tree keeps them", () => {
    const low = { ...reading, limits: [{ kind: "window" as const, id: "w", label: "5h", remainingPercent: 3, resetsAt: null, model: null }] };
    const other = { ...reading, providerId: "codex", accountIdentity: "b@x", limits: [{ ...low.limits[0], remainingPercent: 60 }] };
    const { match, idle } = buildPillTrees([low, other], { hidden: ["claude-code"], names: {} });
    const now = new Date("2026-11-01T10:05:00Z");
    expect(idlePill(idle, now).percent).toBe(60);
    expect(idlePill(match, now).percent).toBe(3);
    expect(match.map((p) => p.providerId)).toContain("claude-code");
  });
});
