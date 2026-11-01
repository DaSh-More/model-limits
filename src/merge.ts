import type { AccountNode, AccountReading, Device, Overrides, ProviderNode } from "./types";

const PROVIDER_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  "kimi-code": "Kimi Code",
  codex: "Codex",
  "acp-cursor": "Cursor",
};

export function accountKey(reading: AccountReading): string {
  if (reading.accountIdentity) return `${reading.providerId}|${reading.accountIdentity}`;
  if ("hostId" in reading.device) return `${reading.providerId}|host:${reading.device.hostId}`;
  return `${reading.providerId}|source:${reading.sourceId}`;
}

function deviceName(d: Device): string {
  return "name" in d ? d.name : "";
}

function mergeDevices(readings: AccountReading[]): Device[] {
  const seen = new Set<string>();
  const out: Device[] = [];
  for (const { device } of readings) {
    const id = "hostId" in device ? device.hostId : "service";
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(device);
  }
  return out;
}

function buildAccount(key: string, group: AccountReading[], overrides: Overrides): AccountNode {
  let newest = group[0];
  for (const x of group) if (Date.parse(x.fetchedAt) > Date.parse(newest.fetchedAt)) newest = x;
  return {
    key,
    label: overrides.names[key] ?? newest.accountLabel,
    planLabel: newest.planLabel,
    devices: mergeDevices(group),
    status: newest.status,
    message: newest.message,
    offline: newest.offline,
    limits: newest.limits,
    fetchedAt: newest.fetchedAt,
  };
}

function isLoginHint(x: AccountReading): boolean {
  return (
    (x.status === "unauthenticated" || x.status === "expired") &&
    x.limits.length === 0 &&
    !x.accountIdentity
  );
}

export function merge(readings: AccountReading[], overrides: Overrides): ProviderNode[] {
  const hidden = new Set(overrides.hidden);
  const byProvider = new Map<string, AccountReading[]>();
  for (const x of readings) {
    if (x.status === "not_installed") continue;
    if (hidden.has(x.providerId)) continue;
    if ("hostId" in x.device && hidden.has(`${x.providerId}|device:${x.device.hostId}`)) continue;
    const list = byProvider.get(x.providerId) ?? [];
    list.push(x);
    byProvider.set(x.providerId, list);
  }

  const result: ProviderNode[] = [];
  for (const [providerId, list] of byProvider) {
    const normal = list.filter((x) => !isLoginHint(x));
    const loginOnly = list.filter(isLoginHint);
    const groups = new Map<string, AccountReading[]>();
    for (const x of normal) {
      const key = accountKey(x);
      groups.set(key, [...(groups.get(key) ?? []), x]);
    }
    const hasOthers = groups.size > 0;
    const hints: { text: string; hostId: string }[] = [];
    if (hasOthers) {
      for (const x of loginOnly) {
        if ("hostId" in x.device) hints.push({ text: `На ${deviceName(x.device)} не выполнен вход`, hostId: x.device.hostId });
      }
    } else {
      for (const x of loginOnly) groups.set(accountKey(x), [...(groups.get(accountKey(x)) ?? []), x]);
    }
    const accounts = [...groups]
      .filter(([key]) => !hidden.has(key))
      .map(([key, g]) => buildAccount(key, g, overrides));
    if (accounts.length === 0 && hints.length === 0) continue;
    result.push({ providerId, name: PROVIDER_NAMES[providerId] ?? providerId, accounts, hints });
  }
  return result;
}
