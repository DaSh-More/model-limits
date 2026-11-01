/** BB reports used percent, which may exceed 100; convert to remaining. */
export function toRemainingPercent(usedPercent: number): number {
  return Math.max(0, 100 - usedPercent);
}
