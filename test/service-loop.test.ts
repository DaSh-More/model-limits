import { describe, expect, it, vi } from "vitest";
import { runServiceLoop } from "../src/service-loop";

describe("runServiceLoop", () => {
  it("collects at start, survives rejections, stops on abort", async () => {
    const ac = new AbortController();
    const collect = vi.fn().mockRejectedValueOnce(new Error("secret body")).mockResolvedValue(undefined);
    const log = vi.fn();
    let ticks = 0;
    await runServiceLoop(
      {
        collect,
        refreshSeconds: async () => 60,
        log,
        sleep: async () => {
          if (++ticks >= 3) ac.abort();
        },
      },
      ac.signal,
    );
    expect(collect).toHaveBeenCalledTimes(3);
    expect(collect).toHaveBeenCalledWith(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
  });
  it("does not collect when disabled and rechecks in 30s", async () => {
    const ac = new AbortController();
    const collect = vi.fn();
    const waits: number[] = [];
    let n = 0;
    await runServiceLoop(
      { collect, refreshSeconds: async () => 0, log: vi.fn(), sleep: async (ms) => { waits.push(ms); if (++n >= 2) ac.abort(); } },
      ac.signal,
    );
    expect(collect).not.toHaveBeenCalled();
    expect(waits).toEqual([30_000, 30_000]);
  });
  it("re-reads the interval each cycle", async () => {
    const ac = new AbortController();
    const vals = [60, 300];
    const waits: number[] = [];
    let i = 0;
    await runServiceLoop(
      { collect: async () => {}, refreshSeconds: async () => vals[Math.min(i++, 1)], log: vi.fn(), sleep: async (ms) => { waits.push(ms); if (waits.length >= 2) ac.abort(); } },
      ac.signal,
    );
    expect(waits).toEqual([60_000, 300_000]);
  });
  it("abortable sleep leaves no timer", async () => {
    const { abortableSleep } = await import("../src/service-loop");
    const ac = new AbortController();
    const p = abortableSleep(10_000_000, ac.signal);
    ac.abort();
    await p;
    await abortableSleep(5, new AbortController().signal);
  });
});
