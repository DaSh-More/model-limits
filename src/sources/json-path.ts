export class PathError extends Error {
  readonly path: string;
  constructor(path: string, reason: string) {
    super(`путь ${path}: ${reason}`);
    this.name = "PathError";
    this.path = path;
  }
}

const MAX_PATHS = 200;
const MAX_DEPTH = 10;

interface Segment {
  name: string;
  star: boolean;
}

function parsePath(path: string): Segment[] {
  if (path.split("[*]").length > 2) throw new PathError(path, "допустим один [*]");
  return path.split(".").map((raw) => {
    const star = raw.endsWith("[*]");
    const name = star ? raw.slice(0, -3) : raw;
    if (name.includes("[") || name.includes("]") || (name === "" && !star)) {
      throw new PathError(path, "неверный синтаксис");
    }
    return { name, star };
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Returns the values at `path`; one element when the path has no `[*]`. */
export function readPath(json: unknown, path: string): unknown[] {
  const segs = parsePath(path);
  let current: unknown[] = [json];
  for (const seg of segs) {
    const next: unknown[] = [];
    for (const node of current) {
      let value: unknown = node;
      if (seg.name !== "") {
        if (!isObject(node) || !Object.hasOwn(node, seg.name)) throw new PathError(path, "поле не найдено");
        value = node[seg.name];
      }
      if (seg.star) {
        if (!Array.isArray(value)) throw new PathError(path, "ожидался массив");
        next.push(...value);
      } else {
        next.push(value);
      }
    }
    current = next;
  }
  return current;
}

/** Field paths of the response, without values. Arrays: first element only. */
export function listFieldPaths(json: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown, prefix: string, depth: number): void => {
    if (out.length >= MAX_PATHS) return;
    if (Array.isArray(node)) {
      const p = prefix + "[*]";
      if (node.length === 0 || depth >= MAX_DEPTH || !isContainer(node[0])) {
        if (prefix !== "") out.push(p);
        return;
      }
      walk(node[0], p, depth + 1);
      return;
    }
    if (isObject(node)) {
      const keys = Object.keys(node);
      if ((keys.length === 0 || depth >= MAX_DEPTH) && prefix !== "") {
        out.push(prefix);
        return;
      }
      for (const k of keys) {
        const p = prefix === "" ? k : `${prefix}.${k}`;
        if (isContainer(node[k])) walk(node[k], p, depth + 1);
        else if (out.length < MAX_PATHS) out.push(p);
      }
      return;
    }
    if (prefix !== "") out.push(prefix);
  };
  const isContainer = (v: unknown) => typeof v === "object" && v !== null;
  walk(json, "", 0);
  return out;
}

/** Part of the path before `[*]`, or null when there is no `[*]`. */
export function arrayPrefix(path: string): string | null {
  const i = path.indexOf("[*]");
  return i < 0 ? null : path.slice(0, i);
}
