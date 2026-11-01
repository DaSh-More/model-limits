---
name: model-limits
description: Show remaining provider limits and balances (Claude Code, Codex, Kimi Code, DeepSeek, Polza and others) with the `bb model-limits` command, force a refresh, or explain the plugin's settings. Use when the user asks how much quota or balance is left, or why the limits pill shows stale or missing data.
---

# Model Limits

The plugin collects usage limits from every connected BB machine and balances from configured HTTP sources, then keeps the latest snapshot.

## Command

- `bb model-limits` prints the current snapshot: providers, accounts, limits, and the lowest remaining percentage.
- `bb model-limits --refresh` collects fresh data first, then prints it.
- `bb model-limits --json` prints bounded JSON (64 KiB, `truncated: true` when cut). It never contains API keys.

Data older than 30 minutes, or a window whose reset time has passed, is marked stale. Balances are shown as amounts and are never summed or counted in the minimum.

## Settings

- `refreshSeconds`: background interval in seconds (60, 120, 300, 600); `0` turns background collection off.
- `showPill`: show the limits pill in the chat.
- `pillFallback`: applies only when no chat is open: `minimum` shows the lowest remaining window, `hidden` hides the pill. A chat with no matching data shows its model and `нет данных`.
- `deepseekApiKey`, `polzaApiKey`, `customKey1` to `customKey5`: secret keys for HTTP balance sources. Each source picks a key slot in the plugin's settings page; the key is only sent to that source's address.
