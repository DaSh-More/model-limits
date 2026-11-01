import { describe, expect, it } from "vitest";
import { listFieldPaths, PathError, readPath } from "../src/sources/json-path";

describe("readPath", () => {
  it("reads nested keys as one-element array", () => {
    expect(readPath({ a: { b: 5 } }, "a.b")).toEqual([5]);
  });
  it("expands [*]", () => {
    expect(readPath({ x: [{ v: 1 }, { v: 2 }] }, "x[*].v")).toEqual([1, 2]);
  });
  it("supports root array", () => {
    expect(readPath([{ v: 1 }], "[*].v")).toEqual([1]);
  });
  it("throws PathError with path on missing key", () => {
    try {
      readPath({ a: 1 }, "a.b.c");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PathError);
      expect((e as PathError).path).toBe("a.b.c");
    }
  });
  it("throws on [*] over non-array and missing key", () => {
    expect(() => readPath({ x: {} }, "x[*].v")).toThrow(PathError);
    expect(() => readPath({}, "x[*].v")).toThrow(PathError);
  });
  it("throws on several [*]", () => {
    expect(() => readPath({ a: [{ b: [1] }] }, "a[*].b[*]")).toThrow(PathError);
  });
});

describe("listFieldPaths", () => {
  it("lists paths without values", () => {
    const out = listFieldPaths({ a: { b: 1 }, c: [{ d: "x" }] });
    expect(out).toEqual(["a.b", "c[*].d"]);
    expect(JSON.stringify(out)).not.toContain('"x"');
  });
  it("walks only the first array element", () => {
    expect(listFieldPaths({ c: [{ d: 1 }, { e: 2 }] })).toEqual(["c[*].d"]);
  });
  it("caps at 200", () => {
    const o: Record<string, number> = {};
    for (let i = 0; i < 500; i++) o["k" + i] = i;
    expect(listFieldPaths(o)).toHaveLength(200);
  });
});
