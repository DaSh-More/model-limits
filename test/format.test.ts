import { describe, expect, it } from "vitest";
import { displayPercent, formatAge, formatAmount, formatReset, isSnapshotShape, statusNote } from "../src/format";

const now = new Date("2026-11-01T12:00:00Z");
const at = (min: number) => new Date(now.getTime() + min * 60000).toISOString();

describe("formatAmount", () => {
  it("prints code for non-RUB", () => expect(formatAmount(12.4, "USD")).toBe("12,40 USD"));
  it("maps RUB to symbol", () => expect(formatAmount(0, "RUB")).toBe("0,00 ₽"));
  it("uses non-breaking space for thousands", () => {
    expect(formatAmount(3200, "RUB")).toContain("3 200");
    expect(formatAmount(1234567.5, "EUR")).toBe("1 234 567,50 EUR");
  });
  it("prints unknown currency by code", () => expect(formatAmount(1, "XYZ")).toBe("1,00 XYZ"));
  it("handles negatives", () => expect(formatAmount(-1234.5, "USD")).toBe("-1 234,50 USD"));
});

describe("formatReset", () => {
  it("empty for null", () => expect(formatReset(null, now)).toBe(""));
  it("empty for past or invalid", () => {
    expect(formatReset(at(-5), now)).toBe("");
    expect(formatReset("junk", now)).toBe("");
  });
  it("minutes under an hour", () => {
    expect(formatReset(at(30), now)).toBe("через 30 мин");
    expect(formatReset(at(0.2), now)).toBe("через 1 мин");
  });
  it("hours under a day", () => {
    expect(formatReset(at(60), now)).toBe("через 1 ч");
    expect(formatReset(at(150), now)).toBe("через 3 ч");
  });
  it("weekday within a week", () => {
    const t = new Date(now.getTime() + 3 * 86400000);
    const wd = new Intl.DateTimeFormat("ru", { weekday: "short" }).format(t);
    expect(formatReset(t.toISOString(), now)).toBe(`в ${wd}`);
  });
  it("date beyond a week", () => {
    const t = new Date(now.getTime() + 20 * 86400000);
    const d = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(t);
    expect(formatReset(t.toISOString(), now)).toBe(d);
  });
});

describe("formatAge", () => {
  const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
  it("just now", () => expect(formatAge(ago(0.5), now)).toBe("обновлено только что"));
  it("minutes", () => expect(formatAge(ago(14), now)).toBe("обновлено 14 мин назад"));
  it("hours", () => expect(formatAge(ago(130), now)).toBe("обновлено 2 ч назад"));
  it("invalid date", () => expect(formatAge("x", now)).toBe(""));
});

describe("displayPercent", () => {
  it("rounds and clamps", () => {
    expect(displayPercent(63.6)).toEqual({ width: 64, text: "64%" });
    expect(displayPercent(150)).toEqual({ width: 100, text: "100%" });
    expect(displayPercent(-3)).toEqual({ width: 0, text: "0%" });
  });
  it("treats non-finite as unknown", () => {
    for (const v of [NaN, Infinity, undefined as unknown as number])
      expect(displayPercent(v)).toEqual({ width: 0, text: "—" });
  });
});

describe("isSnapshotShape", () => {
  it("accepts array tree and object summary", () =>
    expect(isSnapshotShape({ tree: [], summary: {}, updatedAt: null })).toBe(true));
  it("rejects malformed", () => {
    for (const v of [null, 1, {}, { tree: {}, summary: {} }, { tree: [], summary: null }, { tree: [] }])
      expect(isSnapshotShape(v)).toBe(false);
  });
});

describe("statusNote", () => {
  it("unauthenticated uses message or default", () => {
    expect(statusNote("unauthenticated", "Нет ключа deepseekApiKey")).toBe("Нет ключа deepseekApiKey");
    expect(statusNote("unauthenticated", undefined)).toBe("не выполнен вход");
  });
  it("expired uses message or default", () => {
    expect(statusNote("expired", "токен устарел")).toBe("токен устарел");
    expect(statusNote("expired", undefined)).toBe("срок входа истёк");
  });
  it("ok gives null", () => {
    expect(statusNote("ok", "x")).toBeNull();
  });
});
