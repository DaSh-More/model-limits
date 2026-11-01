import { fetchHttpSource } from "./sources/http";
import { readHost, type BbUsageDeps } from "./sources/bb";
import type { AccountReading, HttpSource, KeySlot } from "./types";

export interface Snapshot {
  readings: AccountReading[];
  updatedAt: string | null;
}

export interface CollectorDeps {
  bb: BbUsageDeps;
  loadSources(): Promise<HttpSource[]>;
  readKey(slot: KeySlot): Promise<string | undefined>;
  fetchImpl: typeof fetch;
  load(): Promise<Snapshot | null>;
  save(s: Snapshot): Promise<void>;
  publish(): void;
  now(): Date;
}

const MAX_CONCURRENT = 4;
export const HOST_TIMEOUT_MS = 30_000;
const HOST_ERROR_MESSAGE = "Не удалось получить данные с машины";
const SOURCE_ERROR_MESSAGE = "Не удалось получить данные";

const hostOf = (r: AccountReading): string | null => ("hostId" in r.device ? r.device.hostId : null);

/** One merged reading: fresh status/message, previous data when the fresh one has none. */
function retain(fresh: AccountReading, prev: AccountReading | undefined): AccountReading {
  if (
    (fresh.status === "error" || fresh.status === "expired") &&
    fresh.limits.length === 0 &&
    prev !== undefined &&
    prev.limits.length > 0
  ) {
    return {
      ...fresh,
      limits: prev.limits,
      fetchedAt: prev.fetchedAt,
      accountIdentity: prev.accountIdentity,
      accountLabel: prev.accountLabel,
      planLabel: prev.planLabel,
    };
  }
  return fresh;
}

function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export class Collector {
  private snapshot: Snapshot | null = null;
  private inflight: Promise<Snapshot> | null = null;

  constructor(private readonly deps: CollectorDeps) {}

  private async loadPrev(): Promise<Snapshot> {
    if (this.snapshot) return this.snapshot;
    const loaded = await this.deps.load();
    if (loaded) {
      this.snapshot = loaded;
      return loaded;
    }
    return { readings: [], updatedAt: null };
  }

  async current(): Promise<Snapshot> {
    try {
      return await this.loadPrev();
    } catch {
      return { readings: [], updatedAt: null };
    }
  }

  collect(refresh: boolean): Promise<Snapshot> {
    if (this.inflight) return this.inflight;
    const p = this.run(refresh).finally(() => {
      this.inflight = null;
    });
    this.inflight = p;
    return p;
  }

  private async run(refresh: boolean): Promise<Snapshot> {
    const { deps } = this;
    const prev = (await this.loadPrev()).readings;
    const now = deps.now();
    const limited = createLimiter(MAX_CONCURRENT);

    const sources = (await deps.loadSources()).filter((s) => s.enabled);
    let hosts: { id: string; name: string; connected: boolean }[] | null;
    try {
      hosts = await deps.bb.listHosts();
    } catch {
      hosts = null;
    }

    const prevBb = prev.filter((r) => r.sourceId === "bb");

    const hostTask = async (host: { id: string; name: string; connected: boolean }): Promise<AccountReading[]> => {
      const before = prevBb.filter((r) => hostOf(r) === host.id);
      if (!host.connected) return before.map((r) => ({ ...r, offline: true }));
      let fresh: AccountReading[];
      try {
        fresh = await limited(() => withTimeout(readHost(host, deps.bb, refresh, now), HOST_TIMEOUT_MS));
      } catch {
        return before.map((r) => ({ ...r, status: "error" as const, message: HOST_ERROR_MESSAGE }));
      }
      return fresh.map((r) => retain(r, before.find((p) => p.providerId === r.providerId && p.limits.length > 0)));
    };

    const sourceTask = async (source: HttpSource): Promise<AccountReading[]> => {
      const before = prev.find((r) => r.sourceId === source.id && r.limits.length > 0);
      try {
        const reading = await limited(async () => {
          let key: string | undefined;
          try {
            key = await deps.readKey(source.keySlot);
          } catch {
            key = undefined;
          }
          return (await fetchHttpSource(source, key, deps.fetchImpl, now)).reading;
        });
        return [retain(reading, before)];
      } catch {
        return before ? [{ ...before, status: "error" as const, message: SOURCE_ERROR_MESSAGE }] : [];
      }
    };

    const hostResults = hosts ? hosts.map(hostTask) : [Promise.resolve(prevBb)];
    const results = await Promise.all([...hostResults, ...sources.map(sourceTask)]);

    const next: Snapshot = { readings: results.flat(), updatedAt: now.toISOString() };
    await deps.save(next);
    this.snapshot = next;
    deps.publish();
    return next;
  }
}
