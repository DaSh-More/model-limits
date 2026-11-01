import { useEffect, useRef, useState } from "react";
import { useBbContext, useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { displayPercent, formatAge, formatAmount } from "../src/format";
import { PILL_POSITION, shouldShowPill, type PillConfig } from "../src/pill-position";
import type { rpcContract } from "../src/rpc-contract";
import type { PillView } from "../src/thread-match";

const POLL_MS = 60_000;
const DOT: Record<PillView["tone"], string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  muted: "bg-muted-foreground",
};

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function cardTitle(view: PillView): string {
  if (view.model === null) return "Минимум среди аккаунтов";
  return view.providerName ? `${view.providerName} · ${view.model}` : view.model;
}

export function LimitsPill() {
  const rpc = useRpc<typeof rpcContract>();
  const { threadId } = useBbContext();
  const nav = useBbNavigate();
  const width = useViewportWidth();
  const [config, setConfig] = useState<PillConfig | null>(null);
  const [view, setView] = useState<PillView | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const current = useRef<string | null>(threadId);
  current.current = threadId;
  const seq = useRef(0);
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;

  const load = async () => {
    const asked = threadId;
    const mine = ++seq.current;
    try {
      const next = await rpcRef.current.call("thread_view", { threadId: asked });
      if (mine !== seq.current || asked !== current.current) return;
      setView(next);
      setNow(new Date());
    } catch {
      /* keep last view */
    }
  };

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void rpcRef.current.call("pill_config", null).then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    setView(null);
    setOpen(false);
    void loadRef.current();
    const t = setInterval(() => void loadRef.current(), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);
  useRealtime("snapshot-changed", () => void loadRef.current());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!config || !view || !shouldShowPill(config, view, threadId, width)) return null;

  const label = view.model ?? view.providerName ?? "Минимум";
  const idle = threadId === null;
  const meta = [view.deviceName, view.fetchedAt ? formatAge(view.fetchedAt, now) : null].filter(Boolean).join(" · ");

  return (
    <div
      className="fixed z-30 pointer-events-none"
      style={{ left: PILL_POSITION.left, bottom: PILL_POSITION.bottom, width: PILL_POSITION.width }}
    >
      {open && (
        <div className="pointer-events-auto mb-2 rounded-lg border bg-card p-3 text-xs shadow-lg">
          <div className="truncate text-sm font-medium">{cardTitle(view)}</div>
          <div className="mt-0.5 text-muted-foreground">
            {idle ? "Балансы в минимум не входят" : meta || "нет данных"}
          </div>
          <div className="mt-2 space-y-1">
            {(Array.isArray(view.limits) ? view.limits : []).map((l) => (
              <div key={l.id} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{l.label}</span>
                <span className="tabular-nums">
                  {l.kind === "window" ? displayPercent(l.remainingPercent).text : formatAmount(l.amount, l.currency)}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-warning-text underline-offset-2 hover:underline"
            onClick={() => {
              setOpen(false);
              nav.toPluginPanel("limits");
            }}
          >
            Открыть страницу лимитов
          </button>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex w-full items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs"
      >
        <span className={`size-2 shrink-0 rounded-full ${DOT[view.tone]}`} />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <span className="shrink-0 tabular-nums">{view.text}</span>
      </button>
    </div>
  );
}
