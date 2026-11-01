import { describe, expect, it, vi } from "vitest";
import { readHost, type BbUsageDeps } from "../src/sources/bb";

const now = new Date("2026-11-01T12:00:00Z");
const host = { id: "h1", name: "Ноутбук" };
const mk = (resp: Record<string, unknown>) => {
  const usageLimits = vi.fn(async () => resp);
  const deps: BbUsageDeps = { listHosts: async () => [], usageLimits };
  return { deps, usageLimits };
};

describe("readHost", () => {
  it("maps ok and unauthenticated providers", async () => {
    const { deps, usageLimits } = mk({
      "claude-code": {
        status: "ok",
        accountKey: "anthropic:account:1",
        accountEmail: "a@b.c",
        planLabel: "Pro",
        windows: [{ label: "Неделя", usedPercent: 28, resetsAt: null, model: "opus", extra: 1 }],
        unknownField: true,
      },
      "kimi-code": { status: "unauthenticated" },
    });
    const r = await readHost(host, deps, true, now);
    expect(usageLimits).toHaveBeenCalledWith("h1", true);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      sourceId: "bb",
      providerId: "claude-code",
      accountIdentity: "anthropic:account:1",
      accountLabel: "a@b.c",
      planLabel: "Pro",
      device: { hostId: "h1", name: "Ноутбук" },
      status: "ok",
      message: null,
      offline: false,
      limits: [
        { kind: "window", id: "Неделя", label: "Неделя", remainingPercent: 72, resetsAt: null, model: "opus" },
      ],
      fetchedAt: now.toISOString(),
    });
    expect(r[1]).toMatchObject({ providerId: "kimi-code", status: "unauthenticated", limits: [], accountIdentity: null, accountLabel: null, planLabel: null });
  });

  it("uses window id, nulls non-string resetsAt, skips bad windows", async () => {
    const { deps } = mk({
      p: {
        status: "ok",
        windows: [
          { id: "w1", label: "L", usedPercent: 150, resetsAt: 5 },
          { label: "x", usedPercent: "3" },
          { usedPercent: 3 },
          null,
          { label: "ok", usedPercent: 10, resetsAt: "2026-11-02T00:00:00Z" },
        ],
      },
    });
    const [p] = await readHost(host, deps, false, now);
    expect(p.limits).toEqual([
      { kind: "window", id: "w1", label: "L", remainingPercent: 0, resetsAt: null, model: null },
      { kind: "window", id: "ok", label: "ok", remainingPercent: 90, resetsAt: "2026-11-02T00:00:00Z", model: null },
    ]);
  });

  it("maps unknown status to error, skips non-object entries, keeps not_installed and message", async () => {
    const { deps } = mk({
      a: { status: "weird", windows: [{ label: "x", usedPercent: 1 }] },
      b: "nope",
      c: null,
      d: { status: "not_installed" },
      e: { status: "error", message: "boom" },
    });
    const r = await readHost(host, deps, false, now);
    expect(r.map((x) => x.providerId)).toEqual(["a", "d", "e"]);
    expect(r[0].status).toBe("error");
    expect(r[0].limits).toEqual([]);
    expect(r[0].message).toBeTruthy();
    expect(r[1].status).toBe("not_installed");
    expect(r[2].message).toBe("boom");
  });

  it("propagates usageLimits failure", async () => {
    const deps: BbUsageDeps = { listHosts: async () => [], usageLimits: async () => { throw new Error("down"); } };
    await expect(readHost(host, deps, false, now)).rejects.toThrow("down");
  });
});
