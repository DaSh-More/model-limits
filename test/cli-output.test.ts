import { describe, expect, it } from "vitest";
import { renderJson, renderSummaryText } from "../src/cli-output";
import { summarize } from "../src/summary";
import type { ProviderNode } from "../src/types";

const now = new Date("2026-11-01T12:00:00Z");
const tree = (): ProviderNode[] => [
  {
    providerId: "claude-code",
    name: "Claude Code",
    hints: [],
    accounts: [
      {
        key: "claude-code|a@x", label: "a@x", planLabel: "Max", devices: [{ hostId: "h1", name: "vm" }],
        status: "ok", message: null, offline: false, fetchedAt: "2026-11-01T11:55:00Z",
        limits: [{ kind: "window", id: "w", label: "5h", remainingPercent: 42, resetsAt: "2026-11-01T15:00:00Z", model: null }],
      },
    ],
  },
  {
    providerId: "deepseek",
    name: "DeepSeek",
    hints: [],
    accounts: [
      {
        key: "deepseek|source:ds", label: null, planLabel: null, devices: [{ service: true }],
        status: "ok", message: null, offline: false, fetchedAt: "2026-11-01T11:55:00Z",
        limits: [{ kind: "balance", id: "b", label: "Баланс", amount: 5.5, currency: "USD", model: null }],
      },
    ],
  },
];

describe("renderSummaryText", () => {
  it("shows provider, limit and remaining", () => {
    const t = tree();
    const out = renderSummaryText(t, summarize(t, now), now);
    expect(out).toContain("Claude Code");
    expect(out).toContain("5h");
    expect(out).toContain("42%");
    expect(out).toContain("DeepSeek");
    expect(out).toContain("5,50 USD");
  });
  it("says so when empty", () => {
    expect(renderSummaryText([], summarize([], now), now)).toContain("Нет данных");
  });
});

describe("renderJson", () => {
  it("is valid JSON, not truncated when it fits", () => {
    const t = tree();
    const parsed = JSON.parse(renderJson(t, summarize(t, now), 64 * 1024, now));
    expect(parsed.truncated).toBe(false);
    expect(parsed.tree[0].accounts[0].limits[0].remainingPercent).toBe(42);
  });
  it("truncates over maxBytes and flags it", () => {
    const t = tree();
    const full = renderJson(t, summarize(t, now), 1e6, now);
    const max = Math.floor(new TextEncoder().encode(full).length * 0.7);
    const out = renderJson(t, summarize(t, now), max, now);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(max);
    expect(JSON.parse(out).truncated).toBe(true);
  });
  it("never emits fields that are not selected explicitly", () => {
    const t = tree() as unknown as Record<string, unknown>[];
    (t[0] as Record<string, unknown>).key = "secret";
    ((t[0].accounts as Record<string, unknown>[])[0]).key = "secret";
    ((t[0].accounts as Record<string, unknown>[])[0]).apiKey = "secret";
    const out = renderJson(t as unknown as ProviderNode[], summarize([], now), 64 * 1024, now);
    expect(out).not.toContain("secret");
  });
});

describe("stale marking", () => {
  it("marks a 31-minute-old reading", () => {
    const t = tree();
    t[0].accounts[0].fetchedAt = "2026-11-01T11:29:00Z";
    expect(renderSummaryText(t, summarize(t, now), now)).toContain("данные устарели");
    const j = JSON.parse(renderJson(t, summarize(t, now), 1e6, now));
    expect(j.tree[0].accounts[0].limits[0].stale).toBe(true);
    expect(j.tree[1].accounts[0].limits[0].stale).toBe(false);
  });
  it("marks a window whose reset passed", () => {
    const t = tree();
    (t[0].accounts[0].limits[0] as { resetsAt: string | null }).resetsAt = "2026-11-01T11:00:00Z";
    expect(renderSummaryText(t, summarize(t, now), now)).toContain("данные устарели");
    expect(JSON.parse(renderJson(t, summarize(t, now), 1e6, now)).tree[0].accounts[0].limits[0].stale).toBe(true);
  });
  it("fresh data is not marked", () => {
    const t = tree();
    expect(renderSummaryText(t, summarize(t, now), now)).not.toContain("устарели");
  });
});
