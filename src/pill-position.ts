import type { PillView } from "./thread-match";

export const PILL_POSITION = { left: 12, bottom: 56, width: 206 } as const;
export const MIN_VIEWPORT_WIDTH = 640;

export interface PillConfig {
  showPill: boolean;
  pillFallback: "minimum" | "hidden";
}

// `view` is part of the signature but not needed for the decision; the
// component hides the pill itself while the view is still loading.
export function shouldShowPill(
  config: PillConfig,
  _view: PillView | null,
  threadId: string | null,
  viewportWidth: number,
): boolean {
  if (!config.showPill) return false;
  if (viewportWidth < MIN_VIEWPORT_WIDTH) return false;
  if (threadId === null && config.pillFallback === "hidden") return false;
  return true;
}
