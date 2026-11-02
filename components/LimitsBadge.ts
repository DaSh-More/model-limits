import { useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { badgeFor, type LimitsBadge, type PillConfig } from "../src/pill-ui";
import type { rpcContract } from "../src/rpc-contract";
import type { PillView } from "../src/thread-match";

const POLL_MS = 60_000;

/** Keeps the lowest remaining percent on the limits page's navigation entry. */
export function useLimitsBadge(): LimitsBadge | null {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [config, setConfig] = useState<PillConfig | null>(null);
  const [view, setView] = useState<PillView | null>(null);

  const load = () => {
    void rpcRef.current.call("thread_view", { threadId: null }).then(setView).catch(() => {});
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void rpcRef.current.call("pill_config", null).then(setConfig).catch(() => {});
    loadRef.current();
    const timer = setInterval(() => loadRef.current(), POLL_MS);
    return () => clearInterval(timer);
  }, []);
  useRealtime("snapshot-changed", () => loadRef.current());

  return badgeFor(config, view);
}
