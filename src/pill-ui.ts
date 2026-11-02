import type { PillView } from "./thread-match";

export interface PillConfig {
  showPill: boolean;
  pillFallback: "minimum" | "hidden";
}

export interface LimitsBadge {
  text: string;
  tone: "neutral" | "warning" | "critical";
  label: string;
}

const BADGE_TONE: Record<PillView["tone"], LimitsBadge["tone"]> = {
  good: "neutral",
  warn: "warning",
  bad: "critical",
  muted: "neutral",
};

/** The rail badge of the limits page: the lowest fresh remaining percent. */
export function badgeFor(config: PillConfig | null, view: PillView | null): LimitsBadge | null {
  if (!config || !view || !config.showPill || config.pillFallback === "hidden") return null;
  if (view.percent === null || view.stale) return null;
  const text = `${Math.round(view.percent)}%`;
  const provider = view.providerName ? `${view.providerName}, ` : "";
  return { text, tone: BADGE_TONE[view.tone], label: `Минимальный остаток: ${provider}${text}` };
}
