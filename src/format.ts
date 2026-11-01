const NBSP = " ";
const SYMBOLS: Record<string, string> = { RUB: "₽" };

export function formatAmount(amount: number, currency: string): string {
  const [int, frac] = Math.abs(amount).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = amount < 0 && Number(int + frac) !== 0 ? "-" : "";
  return `${sign}${grouped},${frac} ${SYMBOLS[currency] ?? currency}`;
}

export function formatReset(resetsAt: string | null, now: Date): string {
  if (resetsAt === null) return "";
  const ms = Date.parse(resetsAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const min = ms / 60000;
  if (min < 60) return `через ${Math.max(1, Math.round(min))} мин`;
  const hours = min / 60;
  if (hours < 24) return `через ${Math.round(hours)} ч`;
  const at = new Date(resetsAt);
  if (hours < 24 * 7) return `в ${new Intl.DateTimeFormat("ru", { weekday: "short" }).format(at)}`;
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(at);
}

export function formatAge(fetchedAt: string, now: Date): string {
  const ms = now.getTime() - Date.parse(fetchedAt);
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return "обновлено только что";
  if (min < 60) return `обновлено ${min} мин назад`;
  return `обновлено ${Math.floor(min / 60)} ч назад`;
}

export function displayPercent(value: number): { width: number; text: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) return { width: 0, text: "—" };
  const width = Math.max(0, Math.min(100, Math.round(value)));
  return { width, text: `${width}%` };
}

export function isSnapshotShape(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const r = v as { tree?: unknown; summary?: unknown };
  return Array.isArray(r.tree) && typeof r.summary === "object" && r.summary !== null;
}

/** Status line for unauthenticated/expired accounts, preferring the source's own message. */
export function statusNote(status: string, message: string | null | undefined): string | null {
  if (status === "unauthenticated") return message ?? "не выполнен вход";
  if (status === "expired") return message ?? "срок входа истёк";
  return null;
}
