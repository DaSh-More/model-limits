import { useEffect, useRef, useState } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { usePortalScopeProps } from "../lib/portal-scope";
import { displayPercent, formatAge, formatAmount, formatReset } from "../src/format";
import type { PillConfig } from "../src/pill-ui";
import { isStale } from "../src/summary";
import { LimitBar } from "./LimitRow";
import type { rpcContract } from "../src/rpc-contract";
import { headerLabel, type PillView } from "../src/thread-match";

const POLL_MS = 60_000;
const DOT: Record<PillView["tone"], string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  muted: "bg-muted-foreground",
};

function cardTitle(view: PillView): string {
  if (view.model === null) return view.providerName ?? "Лимит модели";
  return view.providerName ? `${view.providerName} · ${view.model}` : view.model;
}

export function LimitsPill({
  threadId,
  isCompactViewport,
}: {
  threadId: string;
  isCompactViewport: boolean;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const nav = useBbNavigate();
  const portalScope = usePortalScopeProps();
  const [config, setConfig] = useState<PillConfig | null>(null);
  const [view, setView] = useState<PillView | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const current = useRef(threadId);
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

  if (!config?.showPill || !view) return null;

  const label = headerLabel(view);
  const meta = [view.deviceName, view.fetchedAt ? formatAge(view.fetchedAt, now) : null].filter(Boolean).join(" · ");
  const limits = Array.isArray(view.limits) ? view.limits : [];
  const shown = limits.find((l) => l.label === view.limitLabel);
  const reset = shown?.kind === "window" ? formatReset(shown.resetsAt, now) : "";
  const limitLine = [view.limitLabel, reset].filter(Boolean).join(" · ");

  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={150} closeDelay={200}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          aria-label={`${label}: использовано ${view.text}${limitLine ? `, ${limitLine}` : ""}`}
          onClick={() => {
            if (isCompactViewport) setOpen((v) => !v);
            else nav.toPluginPanel("limits");
          }}
          className="flex h-9 max-w-64 flex-col justify-center rounded-md px-2 text-left hover:bg-muted"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4">
            <span className={`size-2 shrink-0 rounded-full ${DOT[view.tone]}`} />
            {isCompactViewport ? null : (
              <>
                <span className="min-w-0 truncate text-muted-foreground">{label}</span>
                <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />
              </>
            )}
            <span className="shrink-0 font-medium tabular-nums">{view.text}</span>
          </span>
          {isCompactViewport || !limitLine ? null : (
            <span className="truncate pl-3.5 text-[10px] leading-3 text-muted-foreground">{limitLine}</span>
          )}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          {...portalScope}
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-64 rounded-lg border bg-card p-3 text-xs text-foreground shadow-lg"
        >
          <div className="truncate text-sm font-medium">{cardTitle(view)}</div>
          <div className="mt-0.5 text-muted-foreground">{meta || "нет данных"}</div>
          <div className="mt-2 space-y-2">
            {limits.map((l) => (
              <div key={l.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{l.label}</span>
                  <span className="tabular-nums">
                    {l.kind === "window" ? displayPercent(l.remainingPercent).text : formatAmount(l.amount, l.currency)}
                  </span>
                </div>
                {l.kind === "window" ? (
                  <LimitBar
                    remaining={l.remainingPercent}
                    stale={view.fetchedAt !== null && isStale(l, view.fetchedAt, now)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
