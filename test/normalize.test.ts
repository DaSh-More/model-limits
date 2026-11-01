import { describe, expect, it } from "vitest";
import { toRemainingPercent } from "../src/normalize";

describe("toRemainingPercent", () => {
  it("converts used to remaining", () => {
    expect(toRemainingPercent(28)).toBe(72);
    expect(toRemainingPercent(0)).toBe(100);
  });
  it("clamps overuse to zero", () => {
    expect(toRemainingPercent(130)).toBe(0);
  });
});
