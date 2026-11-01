import type { Limit, ProviderNode } from "./types";

export const STALE_AFTER_MS = 30 * 60 * 1000;

export function isStale(limit: Limit, fetchedAt: string, now: Date): boolean {
  const fetched = Date.parse(fetchedAt);
  if (!Number.isFinite(fetched) || now.getTime() - fetched > STALE_AFTER_MS) return true;
  if (limit.kind === "window" && limit.resetsAt !== null) {
    const reset = Date.parse(limit.resetsAt);
    if (Number.isFinite(reset) && reset <= now.getTime()) return true;
  }
  return false;
}

export interface Summary {
  minimum: { providerName: string; label: string; remainingPercent: number } | null;
  nextResetAt: string | null;
  accountCount: number;
  deviceCount: number;
}

export function summarize(tree: ProviderNode[], now: Date): Summary {
  let minimum: Summary["minimum"] = null;
  let nextResetAt: string | null = null;
  let nextResetMs = Infinity;
  let accountCount = 0;
  const hosts = new Set<string>();

  for (const provider of tree) {
    for (const account of provider.accounts) {
      accountCount++;
      for (const d of account.devices) if ("hostId" in d) hosts.add(d.hostId);
      if (account.status === "unauthenticated" || account.status === "not_installed") continue;
      for (const limit of account.limits) {
        if (limit.kind !== "window" || isStale(limit, account.fetchedAt, now)) continue;
        if (minimum === null || limit.remainingPercent < minimum.remainingPercent) {
          minimum = {
            providerName: provider.name,
            label: limit.label,
            remainingPercent: limit.remainingPercent,
          };
        }
        if (limit.resetsAt !== null) {
          const ms = Date.parse(limit.resetsAt);
          if (Number.isFinite(ms) && ms > now.getTime() && ms < nextResetMs) {
            nextResetMs = ms;
            nextResetAt = limit.resetsAt;
          }
        }
      }
    }
  }
  return { minimum, nextResetAt, accountCount, deviceCount: hosts.size };
}
