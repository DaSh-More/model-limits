import { z } from "zod";
import { toRemainingPercent } from "../normalize";
import type { AccountReading, Limit } from "../types";

export interface BbUsageDeps {
  listHosts(): Promise<{ id: string; name: string; connected: boolean }[]>;
  usageLimits(hostId: string, refresh: boolean): Promise<Record<string, unknown>>;
}

const optString = z.string().nullish().catch(null);

const entrySchema = z
  .object({
    status: z.unknown(),
    accountKey: optString,
    accountEmail: optString,
    planLabel: optString,
    message: optString,
    windows: z.array(z.unknown()).catch([]),
  })
  .passthrough();

const windowSchema = z
  .object({
    id: optString,
    label: z.string(),
    usedPercent: z.number().refine(Number.isFinite),
    resetsAt: z.unknown(),
    model: optString,
  })
  .passthrough();

const STATUSES = ["ok", "not_installed", "unauthenticated", "expired", "error"] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (s: unknown): s is Status => (STATUSES as readonly unknown[]).includes(s);

function toLimit(raw: unknown): Limit | null {
  const w = windowSchema.safeParse(raw);
  if (!w.success) return null;
  const d = w.data;
  return {
    kind: "window",
    id: d.id || d.label,
    label: d.label,
    remainingPercent: toRemainingPercent(d.usedPercent),
    resetsAt: typeof d.resetsAt === "string" ? d.resetsAt : null,
    model: d.model || null,
  };
}

export async function readHost(
  host: { id: string; name: string },
  deps: BbUsageDeps,
  refresh: boolean,
  now: Date,
): Promise<AccountReading[]> {
  const response = await deps.usageLimits(host.id, refresh);
  const out: AccountReading[] = [];
  for (const [providerId, raw] of Object.entries(response ?? {})) {
    const e = entrySchema.safeParse(raw);
    if (!e.success) continue;
    const d = e.data;
    const rawStatus: unknown = d.status;
    const known = isStatus(rawStatus);
    const status: Status = isStatus(rawStatus) ? rawStatus : "error";
    out.push({
      sourceId: "bb",
      providerId,
      accountIdentity: d.accountKey || null,
      accountLabel: d.accountEmail || null,
      planLabel: d.planLabel || null,
      device: { hostId: host.id, name: host.name },
      status,
      message: known ? d.message || null : "Неизвестный статус провайдера",
      offline: false,
      limits: known ? d.windows.map(toLimit).filter((l): l is Limit => l !== null) : [],
      fetchedAt: now.toISOString(),
    });
  }
  return out;
}
