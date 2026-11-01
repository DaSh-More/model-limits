export const DISABLED_RECHECK_MS = 30_000;
export const COLLECT_FAILED_MESSAGE = "сбор данных не удался, повтор на следующем цикле";

export interface LoopDeps {
  collect(refresh: boolean): Promise<unknown>;
  /** Seconds between collections, 0 for off; re-read each cycle. */
  refreshSeconds(): Promise<number>;
  log(message: string): void;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

/** Resolves after ms or when signal aborts; the timer is cleared either way. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runServiceLoop(deps: LoopDeps, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    let seconds = 0;
    try {
      seconds = await deps.refreshSeconds();
    } catch {
      seconds = 0;
    }
    if (seconds > 0) {
      try {
        await deps.collect(false);
      } catch {
        deps.log(COLLECT_FAILED_MESSAGE);
      }
    }
    await deps.sleep(seconds > 0 ? seconds * 1000 : DISABLED_RECHECK_MS, signal);
  }
}
