import { displayPercent, formatAmount, formatReset } from "../src/format";
import { isStale } from "../src/summary";
import { toneFor } from "../src/thread-match";
import type { Limit } from "../src/types";

const BAR: Record<"good" | "warn" | "bad" | "muted", string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  muted: "bg-muted-foreground/40",
};

/** Fill shows the used share; the colour follows the remaining share. */
export function LimitBar({ remaining, stale }: { remaining: number; stale: boolean }) {
  const known = Number.isFinite(remaining);
  const tone = stale || !known ? "muted" : toneFor(remaining);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
      <div className={`h-full rounded-full ${BAR[tone]}`} style={{ width: `${displayPercent(remaining).width}%` }} />
    </div>
  );
}

export function LimitRow({ limit, fetchedAt, now }: { limit: Limit; fetchedAt: string; now: Date }) {
  const stale = isStale(limit, fetchedAt, now);

  if (limit.kind === "balance") {
    return (
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">{limit.label}</span>
        <span className={`tabular-nums ${stale ? "text-muted-foreground" : ""}`}>
          {formatAmount(limit.amount, limit.currency)}
          {stale && <span className="ml-2 text-xs">данные устарели</span>}
        </span>
      </div>
    );
  }

  const pct = displayPercent(limit.remainingPercent);
  const reset = stale ? "данные устарели" : formatReset(limit.resetsAt, now);
  return (
    <div className="grid grid-cols-[minmax(4rem,8rem)_1fr_3rem_minmax(5rem,7rem)] items-center gap-3 text-sm">
      <span className="truncate">{limit.label}</span>
      <LimitBar remaining={limit.remainingPercent} stale={stale} />
      <span className={`text-right tabular-nums ${stale ? "text-muted-foreground" : ""}`}>{pct.text}</span>
      <span className="truncate text-xs text-muted-foreground">{reset}</span>
    </div>
  );
}
