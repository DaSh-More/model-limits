import { z } from "zod";
import { KEY_SLOTS } from "../types";
import type { AccountReading, HttpSource, Limit } from "../types";
import { arrayPrefix, listFieldPaths, PathError, readPath } from "./json-path";

export { PathError, listFieldPaths, readPath };

const TIMEOUT_MS = 10000;
const MAX_BYTES = 1048576;

const hasNoCredentials = (s: string): boolean => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
};

const nullableStr = z.string().nullable();

export const httpSourceSchema: z.ZodType<HttpSource> = z.object({
  id: z.string().min(1),
  preset: z.enum(["deepseek", "polza"]).nullable(),
  providerName: z.string().min(1),
  organization: nullableStr,
  url: z.string().refine(hasNoCredentials, "только https без логина и пароля"),
  keySlot: z.enum(KEY_SLOTS),
  authHeader: z
    .string()
    .min(1)
    .regex(/^[^\s:]+$/, "заголовок без пробелов, переводов строки и двоеточия"),
  authPrefix: z.string().refine((s) => !/[\r\n]/.test(s), "без переводов строки"),
  amountPath: z.string(),
  currencyPath: nullableStr,
  currencyFixed: nullableStr,
  modelPath: nullableStr,
  organizationPath: nullableStr,
  enabled: z.boolean(),
});

function reading(
  source: HttpSource,
  now: Date,
  status: AccountReading["status"],
  message: string | null,
  organization: string | null,
  limits: Limit[] = [],
): AccountReading {
  return {
    sourceId: source.id,
    providerId: source.providerName,
    accountIdentity: `${source.id}:${organization ?? ""}`,
    accountLabel: organization,
    planLabel: null,
    device: { service: true },
    status,
    message,
    offline: false,
    limits,
    fetchedAt: now.toISOString(),
  };
}

function toAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Values for `path`, spread to `count` elements when the path is not an array path. */
function column(json: unknown, path: string, count: number): unknown[] {
  const vals = readPath(json, path);
  if (vals.length === count) return vals;
  if (vals.length === 1 && arrayPrefix(path) === null) return Array.from({ length: count }, () => vals[0]);
  throw new PathError(path, "число элементов не совпадает с суммой");
}

export function parseBalance(source: HttpSource, json: unknown, now: Date): AccountReading {
  const fixedOrg = source.organization;
  const fail = (msg: string, org: string | null = fixedOrg) => reading(source, now, "error", msg, org);

  if (source.amountPath.trim() === "") return fail("выберите путь к сумме");
  if (source.currencyPath === null && source.currencyFixed === null) {
    return fail("не задана валюта: укажите путь к валюте или фиксированную валюту");
  }
  const amountPrefix = arrayPrefix(source.amountPath);
  const others = [source.currencyPath, source.modelPath, source.organizationPath];
  for (const p of others) {
    if (p === null) continue;
    const pre = arrayPrefix(p);
    if (pre !== null && pre !== amountPrefix) {
      return fail(`пути с [*] указывают на разные массивы: ${source.amountPath} и ${p}`);
    }
  }

  try {
    const amounts = readPath(json, source.amountPath);
    const n = amounts.length;
    const currencies = source.currencyPath !== null ? column(json, source.currencyPath, n) : null;
    const models = source.modelPath !== null ? column(json, source.modelPath, n) : null;
    const orgs = source.organizationPath !== null ? column(json, source.organizationPath, n) : null;

    const orgSet = new Set(orgs?.filter((o): o is string => typeof o === "string" && o !== ""));
    if (orgSet.size > 1) return fail(`по пути ${source.organizationPath} разные организации`);
    const organization = orgSet.size === 1 ? [...orgSet][0] : fixedOrg;

    if (n === 0) return fail("в ответе нет балансов", organization);

    const limits: Limit[] = [];
    for (let i = 0; i < n; i++) {
      const amount = toAmount(amounts[i]);
      if (amount === null) return fail(`по пути ${source.amountPath} не число`, organization);
      let currency: string;
      if (currencies !== null) {
        const c = currencies[i];
        if (typeof c !== "string" || c === "") {
          return fail(`по пути ${source.currencyPath} нет валюты`, organization);
        }
        currency = c;
      } else {
        currency = source.currencyFixed as string;
      }
      const m = models?.[i];
      limits.push({
        kind: "balance",
        id: `${source.id}:${i}`,
        label: "Баланс",
        amount,
        currency,
        model: typeof m === "string" && m !== "" ? m : null,
      });
    }
    return reading(source, now, "ok", null, organization, limits);
  } catch (e) {
    if (e instanceof PathError) return fail(`путь ${e.path} не найден в ответе или неверен`);
    return fail("не удалось разобрать ответ");
  }
}

class TooLarge extends Error {}

async function readBodyLimited(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw new TooLarge();
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function fetchHttpSource(
  source: HttpSource,
  key: string | undefined,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<{ reading: AccountReading; fieldPaths: string[] }> {
  const org = source.organization;
  const out = (status: AccountReading["status"], message: string, fieldPaths: string[] = []) => ({
    reading: reading(source, now, status, message, org),
    fieldPaths,
  });

  if (!key) return out("unauthenticated", `не задан ключ ${source.keySlot}`);
  if (!hasNoCredentials(source.url)) return out("error", "адрес должен быть https без логина и пароля");

  let res: Response;
  try {
    res = await fetchImpl(source.url, {
      method: "GET",
      headers: { [source.authHeader]: source.authPrefix + key, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return out("error", timedOut ? "таймаут запроса" : "сетевая ошибка");
  }

  if (res.status === 401 || res.status === 403) {
    await res.body?.cancel().catch(() => undefined);
    return out("expired", `ключ ${source.keySlot} отклонён сервером (HTTP ${res.status}), обновите ключ`);
  }
  if (res.status < 200 || res.status > 299) {
    await res.body?.cancel().catch(() => undefined);
    const code = res.status >= 300 && res.status < 400 ? `редирект не выполнен, HTTP ${res.status}` : `ошибка HTTP ${res.status}`;
    return out("error", res.status === 0 || res.type === "opaqueredirect" ? "редирект не выполнен" : code);
  }

  let text: string;
  try {
    text = await readBodyLimited(res);
  } catch (e) {
    if (e instanceof TooLarge) return out("error", "ответ слишком велик");
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return out("error", timedOut ? "таймаут запроса" : "сетевая ошибка");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return out("error", "ответ не JSON");
  }

  return { reading: parseBalance(source, json, now), fieldPaths: listFieldPaths(json) };
}
