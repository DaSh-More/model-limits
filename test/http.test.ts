import { describe, expect, it, vi } from "vitest";
import { fetchHttpSource, httpSourceSchema, parseBalance } from "../src/sources/http";
import { PRESETS } from "../src/sources/presets";
import type { HttpSource } from "../src/types";

const now = new Date("2026-11-01T12:00:00Z");
const deepseek: HttpSource = { id: "ds1", enabled: true, ...PRESETS.deepseek, preset: "deepseek" };
const polza: HttpSource = { id: "pz1", enabled: true, ...PRESETS.polza, preset: "polza", organization: "Acme" };
const dsJson = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "110.00" },
    { currency: "USD", total_balance: "5.50" },
  ],
};
const polzaJson = { amount: "1234.56000000", available: "1200.06000000" };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("parseBalance", () => {
  it("DeepSeek gives two balances with currencies", () => {
    const r = parseBalance(deepseek, dsJson, now);
    expect(r.status).toBe("ok");
    expect(r.limits.map((l) => l.kind === "balance" && [l.amount, l.currency])).toEqual([
      [110, "CNY"],
      [5.5, "USD"],
    ]);
    expect(r.limits[0]).toMatchObject({ id: "ds1:0", label: "Баланс", model: null });
    expect(r.limits[1].id).toBe("ds1:1");
    expect(r.providerId).toBe("DeepSeek");
    expect(r.sourceId).toBe("ds1");
    expect(r.device).toEqual({ service: true });
    expect(r.accountIdentity).toBe("ds1:");
    expect(r.offline).toBe(false);
  });
  it("zero amount is 0", () => {
    const r = parseBalance(polza, { available: "0.00" }, now);
    expect(r.limits[0]).toMatchObject({ amount: 0, currency: "RUB" });
  });
  it("bad amount and missing field are errors naming the path", () => {
    for (const j of [{ available: "abc" }, {}]) {
      const r = parseBalance(polza, j, now);
      expect(r.status).toBe("error");
      expect(r.message).toContain("available");
      expect(r.limits).toEqual([]);
    }
  });
  it("[*] over different arrays is a config error", () => {
    const s = { ...deepseek, currencyPath: "other[*].currency" };
    const r = parseBalance(s, { balance_infos: [{ total_balance: "1" }], other: [{ currency: "USD" }] }, now);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/массив/);
  });
  it("non-array currency path applies to all elements", () => {
    const s = { ...deepseek, currencyPath: "cur" };
    const r = parseBalance(s, { cur: "EUR", balance_infos: [{ total_balance: 1 }, { total_balance: 2 }] }, now);
    expect(r.limits).toHaveLength(2);
    expect(r.limits.every((l) => l.kind === "balance" && l.currency === "EUR")).toBe(true);
  });
  it("no currency at all is an error", () => {
    const r = parseBalance({ ...polza, currencyFixed: null }, polzaJson, now);
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/валют/);
  });
  it("organizationPath beats organization; identity uses it", () => {
    const s = { ...polza, organizationPath: "org.name" };
    const r = parseBalance(s, { available: "1", org: { name: "Beta" } }, now);
    expect(r.accountLabel).toBe("Beta");
    expect(r.accountIdentity).toBe("pz1:Beta");
    const r2 = parseBalance(polza, polzaJson, now);
    expect(r2.accountLabel).toBe("Acme");
    expect(r2.accountIdentity).toBe("pz1:Acme");
  });
  it("modelPath fills model per element", () => {
    const s = { ...deepseek, modelPath: "balance_infos[*].m" };
    const r = parseBalance(s, { balance_infos: [{ total_balance: 1, currency: "USD", m: "x" }] }, now);
    expect(r.limits[0]).toMatchObject({ model: "x" });
  });
  it("Polza docs example gives 1200.06 RUB", () => {
    const r = parseBalance(polza, polzaJson, now);
    expect(r.limits).toHaveLength(1);
    expect(r.limits[0]).toMatchObject({ amount: 1200.06, currency: "RUB" });
  });
});

describe("httpSourceSchema", () => {
  const base = { ...polza };
  it("accepts valid", () => {
    expect(httpSourceSchema.safeParse(base).success).toBe(true);
  });
  it("accepts empty amountPath", () => {
    expect(httpSourceSchema.safeParse({ ...base, amountPath: "" }).success).toBe(true);
  });
  it("rejects bad input", () => {
    const bad = [
      { url: "http://polza.ai/x" },
      { url: "https://user:pw@polza.ai/" },
      { url: "not a url" },
      { authHeader: "X-Key\nEvil: 1" },
      { authHeader: "A:B" },
      { authHeader: "A B" },
      { authHeader: "" },
      { authPrefix: "Bearer \r\n" },
      { keySlot: "otherKey" },
    ];
    for (const b of bad) expect(httpSourceSchema.safeParse({ ...base, ...b }).success, JSON.stringify(b)).toBe(false);
  });
});

describe("fetchHttpSource", () => {
  it("without key does not call fetch", async () => {
    const f = vi.fn();
    const { reading, fieldPaths } = await fetchHttpSource(polza, undefined, f as never, now);
    expect(f).not.toHaveBeenCalled();
    expect(reading.status).toBe("unauthenticated");
    expect(reading.message).toBe("не задан ключ polzaApiKey");
    expect(fieldPaths).toEqual([]);
  });
  it("sends header, manual redirect, timeout signal", async () => {
    const f = vi.fn(async () => ok(polzaJson));
    const { reading, fieldPaths } = await fetchHttpSource(polza, "secret-key", f as never, now);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://polza.ai/api/v2/balance");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(reading.status).toBe("ok");
    expect(fieldPaths).toEqual(["amount", "available"]);
  });
  it("302 is an error without following", async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }));
    const { reading } = await fetchHttpSource(polza, "secret-key", f as never, now);
    expect(f).toHaveBeenCalledTimes(1);
    expect(reading.status).toBe("error");
    expect(JSON.stringify(reading)).not.toContain("evil");
  });
  it("401/403 is expired naming the slot, not the key", async () => {
    for (const code of [401, 403]) {
      const f = async () => new Response("secret-body", { status: code });
      const { reading } = await fetchHttpSource(polza, "secret-key", f as never, now);
      expect(reading.status).toBe("expired");
      expect(reading.message).toContain("polzaApiKey");
      expect(reading.message).toContain(String(code));
      expect(JSON.stringify(reading)).not.toMatch(/secret-(key|body)/);
    }
  });
  it("500 leaks neither key nor body", async () => {
    const f = async () => new Response("secret-body", { status: 500 });
    const res = await fetchHttpSource(polza, "secret-key", f as never, now);
    expect(res.reading.status).toBe("error");
    expect(res.reading.message).toContain("500");
    expect(JSON.stringify(res)).not.toMatch(/secret-(key|body)/);
  });
  it("network failure message is generic", async () => {
    const f = async () => {
      throw new Error("connect to https://polza.ai failed with Bearer secret-key");
    };
    const res = await fetchHttpSource(polza, "secret-key", f as never, now);
    expect(res.reading.status).toBe("error");
    expect(JSON.stringify(res)).not.toMatch(/secret-key|polza\.ai/);
  });
  it("timeout is an error", async () => {
    const f = async () => {
      throw new DOMException("t", "TimeoutError");
    };
    const { reading } = await fetchHttpSource(polza, "k", f as never, now);
    expect(reading.status).toBe("error");
    expect(reading.message).toMatch(/таймаут/);
  });
  it("non-JSON 2xx", async () => {
    const f = async () => new Response("<html>secret-body", { status: 200 });
    const res = await fetchHttpSource(polza, "k", f as never, now);
    expect(res.reading.status).toBe("error");
    expect(res.reading.message).toBe("ответ не JSON");
    expect(JSON.stringify(res)).not.toContain("secret-body");
  });
  it("aborts a stream beyond 1 MiB", async () => {
    let cancelled = false;
    let sent = 0;
    const chunk = new Uint8Array(512 * 1024).fill(32);
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        sent++;
        c.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const f = async () => new Response(stream, { status: 200 });
    const { reading } = await fetchHttpSource(polza, "k", f as never, now);
    expect(reading.status).toBe("error");
    expect(reading.message).toMatch(/велик/);
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(10);
  });
  it("empty amountPath errors but returns fieldPaths", async () => {
    const s = { ...polza, amountPath: "" };
    const f = async () => ok(polzaJson);
    const { reading, fieldPaths } = await fetchHttpSource(s, "k", f as never, now);
    expect(reading.status).toBe("error");
    expect(reading.message).toContain("выберите путь к сумме");
    expect(fieldPaths.length).toBeGreaterThan(0);
  });
});

describe("PRESETS", () => {
  it("deepseek", () => {
    expect(PRESETS.deepseek).toMatchObject({
      url: "https://api.deepseek.com/user/balance",
      amountPath: "balance_infos[*].total_balance",
      currencyPath: "balance_infos[*].currency",
      currencyFixed: null,
      keySlot: "deepseekApiKey",
      providerName: "DeepSeek",
      organization: null,
      modelPath: null,
      organizationPath: null,
      authHeader: "Authorization",
      authPrefix: "Bearer ",
    });
  });
  it("polza", () => {
    expect(PRESETS.polza).toMatchObject({
      url: "https://polza.ai/api/v2/balance",
      amountPath: "available",
      currencyPath: null,
      currencyFixed: "RUB",
      keySlot: "polzaApiKey",
      providerName: "Polza",
    });
  });
});
