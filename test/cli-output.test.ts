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
    const out = renderSummaryText(t, summarize(t, now));
    expect(out).toContain("Claude Code");
    expect(out).toContain("5h");
    expect(out).toContain("42%");
    expect(out).toContain("DeepSeek");
    expect(out).toContain("5,50 USD");
  });
  it("says so when empty", () => {
    expect(renderSummaryText([], summarize([], now))).toContain("Нет данных");
  });
});

describe("renderJson", () => {
  it("is valid JSON, not truncated when it fits", () => {
    const t = tree();
    const parsed = JSON.parse(renderJson(t, summarize(t, now), 64 * 1024));
    expect(parsed.truncated).toBe(false);
    expect(parsed.tree[0].accounts[0].limits[0].remainingPercent).toBe(42);
  });
  it("truncates over maxBytes and flags it", () => {
    const t = tree();
    const full = renderJson(t, summarize(t, now), 1e6);
    const max = Math.floor(new TextEncoder().encode(full).length * 0.7);
    const out = renderJson(t, summarize(t, now), max);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(max);
    expect(JSON.parse(out).truncated).toBe(true);
  });
  it("never emits fields that are not selected explicitly", () => {
    const t = tree() as unknown as Record<string, unknown>[];
    (t[0] as Record<string, unknown>).key = "secret";
    ((t[0].accounts as Record<string, unknown>[])[0]).key = "secret";
    ((t[0].accounts as Record<string, unknown>[])[0]).apiKey = "secret";
    const out = renderJson(t as unknown as ProviderNode[], summarize([], now), 64 * 1024);
    expect(out).not.toContain("secret");
  });
});
