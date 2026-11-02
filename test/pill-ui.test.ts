import { describe, expect, it } from "vitest";
import { badgeFor, type PillConfig } from "../src/pill-ui";
import type { PillView } from "../src/thread-match";

const on: PillConfig = { showPill: true, pillFallback: "minimum" };
const view = (over: Partial<PillView>): PillView => ({
  model: null, text: "62%", percent: 62, tone: "good", stale: false,
  limits: [], providerName: "Claude Code", deviceName: null, fetchedAt: null, ...over,
});

describe("badgeFor", () => {
  it("shows the lowest remaining percent", () => {
    expect(badgeFor(on, view({}))).toEqual({ text: "62%", tone: "neutral", label: "Минимальный остаток: Claude Code, 62%" });
  });
  it("maps warning and critical tones", () => {
    expect(badgeFor(on, view({ percent: 24, tone: "warn" }))?.tone).toBe("warning");
    expect(badgeFor(on, view({ percent: 7, tone: "bad" }))?.tone).toBe("critical");
  });
  it("rounds and keeps the text within the host's 8 characters", () => {
    expect(badgeFor(on, view({ percent: 41.6 }))?.text).toBe("42%");
  });
  it("hides when disabled by either setting", () => {
    expect(badgeFor({ ...on, pillFallback: "hidden" }, view({}))).toBeNull();
    expect(badgeFor({ ...on, showPill: false }, view({}))).toBeNull();
  });
  it("hides without a known percent or before loading", () => {
    expect(badgeFor(on, view({ percent: null }))).toBeNull();
    expect(badgeFor(on, null)).toBeNull();
    expect(badgeFor(null, view({}))).toBeNull();
  });
  it("hides stale data rather than presenting it as current", () => {
    expect(badgeFor(on, view({ stale: true, tone: "muted" }))).toBeNull();
  });
});
