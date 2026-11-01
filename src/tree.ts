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

/** Trees for the pill: only matching a chat uses the unhidden tree; the idle pill respects hiding. */
export function buildPillTrees(readings: AccountReading[], overrides: Overrides) {
  return { match: buildDiscoveredTree(readings, overrides), idle: buildStoredTree(readings, overrides) };
}
