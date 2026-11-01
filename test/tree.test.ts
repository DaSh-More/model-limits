import { describe, expect, it } from "vitest";
import { accountKey } from "../src/merge";
import { buildDiscoveredTree, buildStoredTree } from "../src/tree";
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
