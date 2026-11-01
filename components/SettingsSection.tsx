import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SourceForm } from "./SourceForm";
import { draftFromPreset, emptyDraft } from "../src/source-draft";
import type { rpcContract } from "../src/rpc-contract";
import type { AccountNode, HttpSource, Overrides, ProviderNode } from "../src/types";

type Presets = Record<string, Omit<HttpSource, "id" | "enabled">>;
type Editing = { source: HttpSource; isNew: boolean } | null;
const NAME_DEBOUNCE_MS = 500;

function Tag({ children }: { children: string }) {
  return <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{children}</span>;
}

function hostPath(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

/** HTTP account keys are `<providerName>|<sourceId>:<org>` (see accountKey in merge.ts). */
function sourceStatus(source: HttpSource, tree: ProviderNode[]): string {
  const prefix = `${source.providerName}|${source.id}:`;
  for (const p of tree) {
    for (const a of Array.isArray(p.accounts) ? p.accounts : []) {
      if (a.key.startsWith(prefix)) return a.status === "ok" ? "работает" : "ошибка";
    }
  }
  return "проверяется";
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function SettingsSection() {
  const rpc = useRpc<typeof rpcContract>();
  const [sources, setSources] = useState<HttpSource[]>([]);
  const [presets, setPresets] = useState<Presets>({});
  const [tree, setTree] = useState<ProviderNode[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({ hidden: [], names: {} });
  const [editing, setEditing] = useState<Editing>(null);
  const [pickPreset, setPickPreset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const committed = useRef<Overrides>({ hidden: [], names: {} });
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    try {
      const [s, o, d] = await Promise.all([
        rpc.call("sources_list", null),
        rpc.call("overrides_get", null),
        rpc.call("discovered", null),
      ]);
      setSources(asArray<HttpSource>(s?.sources));
      setPresets(s?.presets && typeof s.presets === "object" ? (s.presets as Presets) : {});
      setTree(asArray<ProviderNode>(d?.tree));
      const ov: Overrides = {
        hidden: asArray<string>(o?.hidden),
        names: o?.names && typeof o.names === "object" ? o.names : {},
      };
      committed.current = ov;
      setOverrides(ov);
      setError(null);
    } catch {
      setError("Не удалось загрузить настройки");
    }
  }, [rpc]);

  useEffect(() => {
    void load();
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, [load]);
  useRealtime("snapshot-changed", () => {
    void rpc
      .call("discovered", null)
      .then((d) => setTree(asArray<ProviderNode>(d?.tree)))
      .catch(() => undefined);
  });

  /** Serialised so concurrent changes do not overwrite each other; restores the previous value on failure. */
  const saveOverrides = (change: (o: Overrides) => Overrides, onFail?: () => void) => {
    queue.current = queue.current.then(async () => {
      const prev = committed.current;
      const next = change(prev);
      setOverrides(next);
      try {
        const saved = await rpc.call("overrides_set", next);
        committed.current = {
          hidden: asArray<string>(saved?.hidden),
          names: saved?.names && typeof saved.names === "object" ? saved.names : next.names,
        };
        setOverrides(committed.current);
        setError(null);
      } catch {
        setOverrides(prev);
        onFail?.();
        setError("Не удалось сохранить настройки");
      }
    });
  };

  const toggleShown = (key: string, shown: boolean) =>
    saveOverrides((o) => ({
      ...o,
      hidden: shown ? o.hidden.filter((k) => k !== key) : o.hidden.includes(key) ? o.hidden : [...o.hidden, key],
    }));

  const onName = (key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      saveOverrides(
        (o) => {
          const names = { ...o.names };
          if (value.trim() === "") delete names[key];
          else names[key] = value.trim();
          return { ...o, names };
        },
        () =>
          setDrafts((d) => {
            const { [key]: _drop, ...rest } = d;
            return rest;
          }),
      );
    }, NAME_DEBOUNCE_MS);
  };

  const closeAndReload = () => {
    setEditing(null);
    void load();
  };

  const accounts: { provider: string; account: AccountNode }[] = tree.flatMap((p) =>
    asArray<AccountNode>(p.accounts).map((account) => ({ provider: p.name, account })),
  );

  return (
    <div className="space-y-6">
      {error && <p className="text-xs text-destructive">{error}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">HTTP-источники</h3>
        {sources.length === 0 && <p className="text-xs text-muted-foreground">Источников пока нет</p>}
        {sources.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{s.providerName}</div>
              <div className="truncate text-xs text-muted-foreground">
                {`${hostPath(s.url)} · ключ ${s.keySlot}`}
              </div>
            </div>
            <Tag>{sourceStatus(s, tree)}</Tag>
            <Button size="sm" variant="outline" onClick={() => setEditing({ source: s, isNew: false })}>
              Изменить
            </Button>
          </div>
        ))}

        {editing ? (
          <SourceForm
            key={editing.source.id}
            initial={editing.source}
            isNew={editing.isNew}
            onSaved={closeAndReload}
            onDeleted={closeAndReload}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPickPreset((v) => !v)}>
              + Из пресета
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPickPreset(false);
                setEditing({ source: emptyDraft(crypto.randomUUID()), isNew: true });
              }}
            >
              + Свой сервис
            </Button>
          </div>
        )}
        {pickPreset && !editing && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(presets).map(([name, preset]) => (
              <Button
                key={name}
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPickPreset(false);
                  setEditing({ source: draftFromPreset(preset, crypto.randomUUID()), isNew: true });
                }}
              >
                {preset.providerName}
              </Button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Найденные автоматически</h3>
        {accounts.length === 0 && <p className="text-xs text-muted-foreground">Ничего не найдено</p>}
        {accounts.map(({ provider, account }) => {
          const shown = !overrides.hidden.includes(account.key);
          const devices = asArray<AccountNode["devices"][number]>(account.devices).map((d) =>
            "service" in d ? "сервис" : d.name,
          );
          return (
            <div key={account.key} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
              <input
                type="checkbox"
                aria-label="Показывать"
                checked={shown}
                onChange={(e) => toggleShown(account.key, e.target.checked)}
              />
              <span className="min-w-0 flex-1 truncate">
                {account.label ?? provider}
                <span className="ml-2 text-xs text-muted-foreground">{provider}</span>
              </span>
              {devices.map((n) => (
                <Tag key={n}>{n}</Tag>
              ))}
              <Input
                className="h-8 w-40 text-xs"
                placeholder="Своё имя"
                value={drafts[account.key] ?? overrides.names[account.key] ?? ""}
                onChange={(e) => onName(account.key, e.target.value)}
              />
            </div>
          );
        })}
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-medium">Общие настройки и ключи</h3>
        <p className="text-xs text-muted-foreground">
          Интервал обновления, показ плашки, вид без открытого чата и секретные поля ключей находятся в стандартных
          настройках плагина над этим блоком. Значения ключей здесь не показываются.
        </p>
      </section>
    </div>
  );
}
