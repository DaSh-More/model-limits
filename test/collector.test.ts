import { describe, expect, it, vi } from "vitest";
import { Collector, type CollectorDeps, type Snapshot } from "../src/collector";
import { PRESETS } from "../src/sources/presets";
import type { AccountReading, HttpSource } from "../src/types";

const t0 = new Date("2026-11-01T12:00:00Z");
const t1 = new Date("2026-11-01T12:10:00Z");
const ds: HttpSource = { id: "ds1", enabled: true, ...PRESETS.deepseek, preset: "deepseek" };
const pz: HttpSource = { id: "pz1", enabled: true, ...PRESETS.polza, preset: "polza" };
const dsOk = () =>
  new Response(JSON.stringify({ balance_infos: [{ currency: "USD", total_balance: "5.5" }] }), { status: 200 });
const pzOk = () => new Response(JSON.stringify({ amount: "10", available: "9" }), { status: 200 });

function setup(over: Partial<CollectorDeps> = {}, initial: Snapshot | null = null) {
  let stored: Snapshot | null = initial;
  let time = t0;
  const deps: CollectorDeps = {
    bb: { listHosts: async () => [], usageLimits: async () => ({}) },
    loadSources: async () => [ds, pz],
    readKey: async () => "k",
    fetchImpl: (async (url: string) => (String(url).includes("deepseek") ? dsOk() : pzOk())) as typeof fetch,
    load: async () => stored,
    save: async (s) => {
      stored = s;
    },
    publish: vi.fn(),
    now: () => time,
    ...over,
  };
  return { deps, c: new Collector(deps), setTime: (d: Date) => (time = d), stored: () => stored };
}

const claude = (extra: Partial<AccountReading> = {}): AccountReading => ({
  sourceId: "bb",
  providerId: "claude",
  accountIdentity: "a",
  accountLabel: "a@x",
  planLabel: "Max",
  device: { hostId: "h1", name: "H1" },
  status: "ok",
  message: null,
  offline: false,
  limits: [{ kind: "window", id: "5h", label: "5h", remainingPercent: 50, resetsAt: null, model: null }],
  fetchedAt: "2026-11-01T11:00:00.000Z",
  ...extra,
});

describe("Collector", () => {
  it("current() without snapshot is empty", async () => {
    expect(await setup().c.current()).toEqual({ readings: [], updatedAt: null });
  });

  it("collect saves then publishes", async () => {
    const order: string[] = [];
    const publish = vi.fn(() => void order.push("publish"));
    const { c } = setup({ save: async () => void order.push("save"), publish });
    const s = await c.collect(false);
    expect(order).toEqual(["save", "publish"]);
    expect(s.updatedAt).toBe(t0.toISOString());
    expect(s.readings.map((r) => r.sourceId)).toEqual(["ds1", "pz1"]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await c.current()).toEqual(s);
  });

  it("save failure propagates, no publish, and next collect works", async () => {
    let fail = true;
    const { c, deps } = setup({
      save: async () => {
        if (fail) throw new Error("disk");
      },
    });
    await expect(c.collect(false)).rejects.toThrow("disk");
    expect(deps.publish).not.toHaveBeenCalled();
    fail = false;
    await expect(c.collect(false)).resolves.toBeTruthy();
  });

  it("one failing HTTP source keeps previous limits and fetchedAt", async () => {
    let dsFail = false;
    const { c, setTime } = setup({
      fetchImpl: (async (url: string) =>
        String(url).includes("deepseek") ? (dsFail ? new Response("x", { status: 500 }) : dsOk()) : pzOk()) as typeof fetch,
    });
    await c.collect(false);
    dsFail = true;
    setTime(t1);
    const s = await c.collect(false);
    const d = s.readings.find((r) => r.sourceId === "ds1")!;
    expect(d.status).toBe("error");
    expect(d.message).toContain("500");
    expect(d.limits).toHaveLength(1);
    expect(d.fetchedAt).toBe(t0.toISOString());
    const p = s.readings.find((r) => r.sourceId === "pz1")!;
    expect(p.status).toBe("ok");
    expect(p.fetchedAt).toBe(t1.toISOString());
  });

  it("expired keeps previous limits and fetchedAt", async () => {
    let status = 200;
    const { c } = setup({
      loadSources: async () => [ds],
      fetchImpl: (async () => (status === 200 ? dsOk() : new Response("", { status }))) as typeof fetch,
    });
    await c.collect(false);
    status = 401;
    const s = await c.collect(false);
    expect(s.readings[0]).toMatchObject({ status: "expired", fetchedAt: t0.toISOString() });
    expect(s.readings[0].limits).toHaveLength(1);
  });

  it("readKey failure acts as missing key", async () => {
    const { c } = setup({
      loadSources: async () => [ds],
      readKey: async () => {
        throw new Error("secret store");
      },
    });
    const s = await c.collect(false);
    expect(s.readings[0].status).toBe("unauthenticated");
    expect(JSON.stringify(s)).not.toContain("secret store");
  });

  it("removed or disabled sources drop and are not fetched", async () => {
    const fetchImpl = vi.fn(async () => dsOk()) as unknown as typeof fetch;
    let sources = [ds, pz];
    const { c } = setup({ loadSources: async () => sources, fetchImpl });
    await c.collect(false);
    sources = [{ ...ds, enabled: false }, pz];
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const s = await c.collect(false);
    expect(s.readings.map((r) => r.sourceId)).toEqual(["pz1"]);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length - calls).toBe(1);
    sources = [];
    expect((await c.collect(false)).readings).toEqual([]);
  });

  it("HTTP retention matches by sourceId even if identity differs", async () => {
    let fail = false;
    const { c } = setup({
      loadSources: async () => [{ ...pz, organization: "Acme" }],
      fetchImpl: (async () => (fail ? new Response("", { status: 500 }) : pzOk())) as typeof fetch,
    });
    await c.collect(false);
    fail = true;
    const s = await c.collect(false);
    expect(s.readings).toHaveLength(1);
    expect(s.readings[0].limits.length).toBeGreaterThan(0);
  });

  const usage = (status = "ok") => ({
    claude: { status, accountKey: "a", accountEmail: "a@x", planLabel: "Max", message: status === "ok" ? null : "m", windows: status === "ok" ? [{ label: "5h", usedPercent: 10, resetsAt: null }] : [] },
  });

  it("offline host: not queried, previous readings kept with offline true", async () => {
    const usageLimits = vi.fn(async () => ({}));
    const { c } = setup(
      {
        loadSources: async () => [],
        bb: { listHosts: async () => [{ id: "h1", name: "H1", connected: false }], usageLimits },
      },
      { readings: [claude()], updatedAt: "x" },
    );
    const s = await c.collect(false);
    expect(usageLimits).not.toHaveBeenCalled();
    expect(s.readings).toEqual([claude({ offline: true })]);
  });

  it("host that disappears from listHosts drops readings", async () => {
    const { c } = setup(
      { loadSources: async () => [] },
      { readings: [claude()], updatedAt: "x" },
    );
    expect((await c.collect(false)).readings).toEqual([]);
  });

  it("usageLimits failure keeps previous readings as error with generic message", async () => {
    const { c } = setup(
      {
        loadSources: async () => [],
        bb: {
          listHosts: async () => [{ id: "h1", name: "H1", connected: true }],
          usageLimits: async () => {
            throw new Error("secret detail");
          },
        },
      },
      { readings: [claude()], updatedAt: "x" },
    );
    const s = await c.collect(false);
    expect(s.readings).toHaveLength(1);
    expect(s.readings[0]).toMatchObject({ status: "error", fetchedAt: "2026-11-01T11:00:00.000Z" });
    expect(s.readings[0].limits).toHaveLength(1);
    expect(JSON.stringify(s)).not.toContain("secret detail");
  });

  it("usageLimits failure with no previous readings gives no rows", async () => {
    const { c } = setup({
      loadSources: async () => [],
      bb: {
        listHosts: async () => [{ id: "h1", name: "H1", connected: true }],
        usageLimits: async () => {
          throw new Error("x");
        },
      },
    });
    expect((await c.collect(false)).readings).toEqual([]);
  });

  it("provider expired on BB retains previous limits; missing providers are dropped; refresh is passed", async () => {
    const usageLimits = vi.fn(async () => usage("expired"));
    const { c } = setup(
      {
        loadSources: async () => [],
        bb: { listHosts: async () => [{ id: "h1", name: "H1", connected: true }], usageLimits },
      },
      { readings: [claude(), claude({ providerId: "kimi" })], updatedAt: "x" },
    );
    const s = await c.collect(true);
    expect(usageLimits).toHaveBeenCalledWith("h1", true);
    expect(s.readings).toHaveLength(1);
    expect(s.readings[0]).toMatchObject({
      providerId: "claude",
      status: "expired",
      message: "m",
      fetchedAt: "2026-11-01T11:00:00.000Z",
      offline: false,
    });
    expect(s.readings[0].limits).toHaveLength(1);
  });

  it("listHosts failure keeps BB readings and still refreshes HTTP", async () => {
    const { c } = setup(
      {
        bb: {
          listHosts: async () => {
            throw new Error("down");
          },
          usageLimits: async () => ({}),
        },
      },
      { readings: [claude()], updatedAt: "x" },
    );
    const s = await c.collect(false);
    expect(s.readings.map((r) => r.sourceId)).toEqual(["bb", "ds1", "pz1"]);
    expect(s.readings[0]).toEqual(claude());
  });

  it("concurrent collect shares one pass", async () => {
    const loadSources = vi.fn(async () => [ds]);
    const { c } = setup({ loadSources });
    const [a, b] = await Promise.all([c.collect(false), c.collect(true)]);
    expect(a).toBe(b);
    expect(loadSources).toHaveBeenCalledTimes(1);
  });

  it("at most 4 requests in flight across hosts and sources", async () => {
    let cur = 0;
    let max = 0;
    const slow = async <T,>(v: T): Promise<T> => {
      cur++;
      max = Math.max(max, cur);
      await new Promise((r) => setTimeout(r, 5));
      cur--;
      return v;
    };
    const sources = Array.from({ length: 6 }, (_, i) => ({ ...ds, id: `s${i}` }));
    const { c } = setup({
      loadSources: async () => sources,
      fetchImpl: (async () => slow(dsOk())) as typeof fetch,
      bb: {
        listHosts: async () => Array.from({ length: 4 }, (_, i) => ({ id: `h${i}`, name: "n", connected: true })),
        usageLimits: () => slow({}),
      },
    });
    const s = await c.collect(false);
    expect(s.readings).toHaveLength(6);
    expect(max).toBe(4);
  });
});
