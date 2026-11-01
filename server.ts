import { defineCli, experimental_PluginRpcRefusal as Refusal, type BbPluginApi } from "@get-bb/plugin-sdk";
import { renderJson, renderSummaryText } from "./src/cli-output";
import { Collector, type Snapshot } from "./src/collector";
import { rpcContract } from "./src/rpc-contract";
import { abortableSleep, runServiceLoop } from "./src/service-loop";
import { fetchHttpSource } from "./src/sources/http";
import { presetKeyMismatch } from "./src/sources/guard";
import { PRESETS } from "./src/sources/presets";
import { summarize } from "./src/summary";
import { matchThread, idlePill, resolveProviderId, type PillView } from "./src/thread-match";
import { buildDiscoveredTree, buildPillTrees, buildStoredTree } from "./src/tree";
import { KEY_SLOTS, type HttpSource, type KeySlot, type Overrides } from "./src/types";

const KV_SNAPSHOT = "snapshot";
const KV_SOURCES = "sources";
const KV_OVERRIDES = "overrides";
const CHANNEL = "snapshot-changed";
const CATALOG_TTL_MS = 10 * 60 * 1000;
const CATALOG_FAIL_TTL_MS = 60 * 1000;
const CLI_MAX_BYTES = 64 * 1024;
const REFRESH_FAILED = "Не удалось обновить данные";

const keyField = (label: string) => ({ type: "string" as const, label, secret: true as const });

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    refreshSeconds: {
      type: "select",
      label: "Интервал обновления",
      options: ["60", "120", "300", "600", "0"],
      experimental_optionLabels: {
        "60": "1 минута", "120": "2 минуты", "300": "5 минут", "600": "10 минут", "0": "Выключено",
      },
      default: "120",
    },
    showPill: { type: "boolean", label: "Показывать плашку в чате", default: true },
    pillFallback: {
      type: "select",
      label: "Плашка вне чата",
      options: ["minimum", "hidden"],
      experimental_optionLabels: { minimum: "Минимальный остаток", hidden: "Скрыть" },
      default: "minimum",
    },
    deepseekApiKey: keyField("Ключ DeepSeek"),
    polzaApiKey: keyField("Ключ Polza"),
    customKey1: keyField("Ключ 1"),
    customKey2: keyField("Ключ 2"),
    customKey3: keyField("Ключ 3"),
    customKey4: keyField("Ключ 4"),
    customKey5: keyField("Ключ 5"),
  });

  const kv = bb.storage.kv;
  const loadSources = async (): Promise<HttpSource[]> => (await kv.get<HttpSource[]>(KV_SOURCES)) ?? [];
  const loadOverrides = async (): Promise<Overrides> => {
    const o = await kv.get<Overrides>(KV_OVERRIDES);
    return { hidden: o?.hidden ?? [], names: o?.names ?? {} };
  };
  const readKey = async (slot: KeySlot): Promise<string | undefined> => {
    if (!KEY_SLOTS.includes(slot)) return undefined;
    const v = (await settings.get())[slot];
    return typeof v === "string" && v !== "" ? v : undefined;
  };

  const collector = new Collector({
    bb: {
      listHosts: async () =>
        (await bb.sdk.hosts.list()).map((h) => ({ id: h.id, name: h.name, connected: h.status === "connected" })),
      usageLimits: async (hostId, refresh) =>
        (await bb.sdk.system.usageLimits({ hostId, refresh })) as Record<string, unknown>,
    },
    loadSources,
    readKey,
    fetchImpl: fetch,
    load: async () => (await kv.get<Snapshot>(KV_SNAPSHOT)) ?? null,
    save: (s) => kv.set(KV_SNAPSHOT, s),
    publish: () => bb.realtime.publish(CHANNEL, null),
    now: () => new Date(),
  });

  const storedView = async () => {
    const snap = await collector.current();
    const tree = buildStoredTree(snap.readings, await loadOverrides());
    return { tree, summary: summarize(tree, new Date()), updatedAt: snap.updatedAt };
  };

  const catalogCache = new Map<string, { at: number; ttl: number; models: string[] }>();
  const catalogFor = async (providerId: string): Promise<string[]> => {
    const hit = catalogCache.get(providerId);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.models;
    let models: string[] = [];
    let ttl = CATALOG_TTL_MS;
    try {
      models = (await bb.sdk.providers.models({ providerId })).models.map((m) => m.model);
    } catch {
      ttl = CATALOG_FAIL_TTL_MS;
    }
    catalogCache.set(providerId, { at: Date.now(), ttl, models });
    return models;
  };

  const threadView = async (threadId: string | null): Promise<PillView> => {
    const snap = await collector.current();
    const { match: tree, idle } = buildPillTrees(snap.readings, await loadOverrides());
    const now = new Date();
    if (threadId === null) return idlePill(idle, now);
    try {
      const thread = await bb.sdk.threads.get({ threadId });
      let hostId: string | null = null;
      try {
        if (thread.environmentId) {
          hostId = (await bb.sdk.environments.get({ environmentId: thread.environmentId })).hostId;
        }
      } catch {
        hostId = null;
      }
      let model: string | null = null;
      try {
        const events = await bb.sdk.threads.events.list({ threadId, limit: "50", order: "desc" });
        let best = -Infinity;
        for (const e of events) {
          const m = (e.data as { execution?: { model?: unknown } }).execution?.model;
          if (typeof m === "string" && m !== "" && e.seq > best) {
            best = e.seq;
            model = m;
          }
        }
      } catch {
        model = null;
      }
      const resolved = resolveProviderId({ providerId: thread.providerId, model, hostId });
      const catalog = resolved ? await catalogFor(resolved.id) : [];
      return matchThread({ providerId: thread.providerId, model, hostId }, tree, catalog, now);
    } catch {
      return idlePill(idle, now);
    }
  };

  const recollect = () => {
    collector.collect(false).catch(() => bb.log.warn("сбор после изменения источника не удался"));
  };

  const refresh = async () => {
    try {
      await collector.collect(true);
    } catch {
      throw new Refusal({ code: "conflict", message: REFRESH_FAILED });
    }
    return storedView();
  };

  bb.rpc.register(rpcContract, {
    snapshot_get: storedView,
    refresh,
    thread_view: ({ threadId }) => threadView(threadId),
    pill_config: async () => {
      const s = await settings.get();
      return { showPill: s.showPill, pillFallback: s.pillFallback === "hidden" ? ("hidden" as const) : ("minimum" as const) };
    },
    sources_list: async () => ({ sources: await loadSources(), presets: PRESETS }),
    source_save: async (source) => {
      const bad = presetKeyMismatch(source);
      if (bad) throw new Refusal({ code: "invalid", message: bad });
      const all = await loadSources();
      const i = all.findIndex((s) => s.id === source.id);
      if (i >= 0) all[i] = source;
      else all.push(source);
      await kv.set(KV_SOURCES, all);
      recollect();
      return { source };
    },
    source_delete: async ({ id }) => {
      const all = await loadSources();
      const next = all.filter((s) => s.id !== id);
      if (next.length !== all.length) {
        await kv.set(KV_SOURCES, next);
        recollect();
      }
      return { removed: next.length !== all.length };
    },
    source_test: async (source) => {
      const bad = presetKeyMismatch(source);
      if (bad) throw new Refusal({ code: "invalid", message: bad });
      const key = await readKey(source.keySlot);
      return fetchHttpSource(source, key, fetch, new Date());
    },
    overrides_get: loadOverrides,
    overrides_set: async (o) => {
      const clean = { hidden: [...o.hidden], names: { ...o.names } };
      await kv.set(KV_OVERRIDES, clean);
      bb.realtime.publish(CHANNEL, null);
      return clean;
    },
    discovered: async () => ({ tree: buildDiscoveredTree((await collector.current()).readings, await loadOverrides()) }),
  });

  bb.cli.register(
    defineCli({
      name: "model-limits",
      summary: "Остатки лимитов и балансы провайдеров",
      commands: {},
      root: {
        summary: "Показать текущий снимок лимитов",
        options: {
          refresh: { type: "boolean", description: "Собрать данные заново" },
          json: { type: "boolean", description: "Вывести JSON" },
        },
        run: async ({ options }) => {
          try {
            if (options.refresh) await collector.collect(true);
          } catch {
            return { exitCode: 1, stderr: `${REFRESH_FAILED}\n` };
          }
          const view = await storedView();
          const stdout = options.json
            ? renderJson(view.tree, view.summary, CLI_MAX_BYTES, new Date()) + "\n"
            : renderSummaryText(view.tree, view.summary, new Date());
          return { exitCode: 0, stdout };
        },
      },
    }),
  );

  bb.background.service("collector", {
    start: (signal) =>
      runServiceLoop(
        {
          collect: (refreshNow) => collector.collect(refreshNow),
          refreshSeconds: async () => Number((await settings.get()).refreshSeconds) || 0,
          log: (m) => bb.log.warn(m),
          sleep: abortableSleep,
        },
        signal,
      ),
  });

  bb.log.info("loaded");
}
