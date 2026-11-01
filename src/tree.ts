import { merge } from "./merge";
import type { AccountReading, Overrides, ProviderNode } from "./types";

/** Tree with the user's hiding applied: page, refresh, CLI. */
export function buildStoredTree(readings: AccountReading[], overrides: Overrides): ProviderNode[] {
  return merge(readings, overrides);
}

/** Tree without hiding (stored names kept): open-chat pill and the settings list. */
export function buildDiscoveredTree(readings: AccountReading[], overrides: Overrides): ProviderNode[] {
  return merge(readings, { hidden: [], names: overrides.names });
}
