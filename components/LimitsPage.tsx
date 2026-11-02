import { useCallback, useEffect, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "./ui/button";
import { ProviderGroup } from "./ProviderGroup";
import { formatAge, formatReset, isSnapshotShape } from "../src/format";
import type { rpcContract } from "../src/rpc-contract";
import type { Summary } from "../src/summary";
import type { ProviderNode } from "../src/types";

interface View {
  tree: ProviderNode[];
  summary: Summary;
  updatedAt: string | null;
}

function Tile({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 truncate text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

export function SummaryTiles({ summary, now }: { summary: Summary; now: Date }) {
  const min = summary.minimum;
  const reset = formatReset(summary.nextResetAt, now);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile title="Больше всего использовано" value={min ? `${100 - Math.round(min.remainingPercent)}% · ${min.providerName}` : "—"} />
      <Tile title="Ближайший сброс" value={reset || "—"} />
      <Tile title="Аккаунтов" value={String(summary.accountCount)} />
      <Tile title="Устройств" value={String(summary.deviceCount)} />
    </div>
  );
}

export function LimitsPage() {
  const rpc = useRpc<typeof rpcContract>();
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const next = await rpc.call("snapshot_get", null);
      if (!isSnapshotShape(next)) throw new Error("bad shape");
      setView(next);
      setError(null);
      setNow(new Date());
    } catch {
      setError("Не удалось загрузить данные");
    }
  }, [rpc]);

  useEffect(() => {
    void load();
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [load]);
  useRealtime("snapshot-changed", () => void load());

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await rpc.call("refresh", null);
      if (!isSnapshotShape(next)) throw new Error("bad shape");
      setView(next);
      setNow(new Date());
    } catch {
      setError("Не удалось обновить");
    } finally {
      setBusy(false);
    }
  };

  const empty = view !== null && view.tree.length === 0;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Лимиты</h1>
        <span className="text-xs text-muted-foreground">
          {view?.updatedAt ? formatAge(view.updatedAt, now).replace(/^обновлено/, "Обновлено") : ""}
        </span>
        <Button className="ml-auto" size="sm" variant="outline" disabled={busy} onClick={refresh}>
          {busy ? "Обновление…" : "Обновить"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {view === null ? (
        !error && <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">Данных пока нет</p>
      ) : (
        <>
          <SummaryTiles summary={view.summary} now={now} />
          {view.tree.map((p) => (
            <ProviderGroup key={p.providerId} provider={p} now={now} />
          ))}
        </>
      )}
    </div>
  );
}
