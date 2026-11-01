import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedSaves } from "../src/debounced-saves";

describe("createDebouncedSaves", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves after the delay", () => {
    const save = vi.fn();
    const d = createDebouncedSaves(500, save);
    d.set("a", "x");
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledWith("a", "x");
  });

  it("flush saves pending at once and cancels timers; second flush does nothing", () => {
    const save = vi.fn();
    const d = createDebouncedSaves(500, save);
    d.set("a", "x");
    d.set("b", "y");
    d.flush();
    expect(save).toHaveBeenCalledTimes(2);
    d.flush();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("a later edit of the same key replaces the pending value", () => {
    const save = vi.fn();
    const d = createDebouncedSaves(500, save);
    d.set("a", "x");
    vi.advanceTimersByTime(300);
    d.set("a", "xy");
    vi.advanceTimersByTime(300);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a", "xy");
  });

  it("flush(key) only flushes that key", () => {
    const save = vi.fn();
    const d = createDebouncedSaves(500, save);
    d.set("a", "x");
    d.set("b", "y");
    d.flush("a");
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
