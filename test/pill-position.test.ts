import { describe, expect, it } from "vitest";
import { PILL_POSITION, shouldShowPill } from "../src/pill-position";

const on = { showPill: true, pillFallback: "minimum" as const };
const hiddenFb = { showPill: true, pillFallback: "hidden" as const };

describe("shouldShowPill", () => {
  it("has the fixed position", () => {
    expect(PILL_POSITION).toEqual({ left: 12, bottom: 56, width: 206 });
  });
  it("hides when showPill is false", () => {
    expect(shouldShowPill({ ...on, showPill: false }, null, "t1", 1200)).toBe(false);
  });
  it("hides below 640, shows at 640", () => {
    expect(shouldShowPill(on, null, "t1", 639)).toBe(false);
    expect(shouldShowPill(on, null, "t1", 640)).toBe(true);
  });
  it("without a chat depends on fallback", () => {
    expect(shouldShowPill(hiddenFb, null, null, 1200)).toBe(false);
    expect(shouldShowPill(on, null, null, 1200)).toBe(true);
  });
  it("with a chat shows for any fallback", () => {
    expect(shouldShowPill(hiddenFb, null, "t1", 1200)).toBe(true);
    expect(shouldShowPill(on, null, "t1", 1200)).toBe(true);
  });
});
