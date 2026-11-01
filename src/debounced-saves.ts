/** Per-key debounced saves with an explicit flush (blur, unmount) that never saves twice. */
export function createDebouncedSaves(delayMs: number, save: (key: string, value: string) => void) {
  const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

  const run = (key: string) => {
    const p = pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(key);
    save(key, p.value);
  };

  return {
    set(key: string, value: string) {
      const old = pending.get(key);
      if (old) clearTimeout(old.timer);
      pending.set(key, { value, timer: setTimeout(() => run(key), delayMs) });
    },
    flush(key?: string) {
      if (key !== undefined) run(key);
      else for (const k of [...pending.keys()]) run(k);
    },
  };
}
