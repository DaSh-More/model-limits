import { PRESETS } from "./presets";
import type { HttpSource } from "../types";

const SLOT_URL: Record<string, string> = {
  [PRESETS.deepseek.keySlot]: PRESETS.deepseek.url,
  [PRESETS.polza.keySlot]: PRESETS.polza.url,
};

/** Russian error text when a preset source would send a preset's named key to a foreign url, else null. */
export function presetKeyMismatch(source: HttpSource): string | null {
  if (source.preset === null) return null;
  const expected = SLOT_URL[source.keySlot];
  if (expected === undefined || source.url === expected) return null;
  return `Ключ ${source.keySlot} нельзя отправлять на другой адрес. Верните адрес пресета или выберите другой слот ключа.`;
}
