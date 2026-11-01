import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { httpSourceSchema } from "./sources/http";
import type { PRESETS } from "./sources/presets";
import type { Summary } from "./summary";
import type { PillView } from "./thread-match";
import type { AccountReading, HttpSource, Overrides, ProviderNode } from "./types";

const typed = <T>() => z.custom<T>();

const overridesSchema: z.ZodType<Overrides> = z.object({
  hidden: z.array(z.string()),
  names: z.record(z.string(), z.string()),
});

const snapshotView = z.object({
  tree: typed<ProviderNode[]>(),
  summary: typed<Summary>(),
  updatedAt: z.string().nullable(),
});

const m = <I extends z.ZodType, O extends z.ZodType>(input: I, output: O) => ({ input, output });

export const rpcContract = defineRpcContract({
  snapshot_get: m(z.null(), snapshotView),
  refresh: m(z.null(), snapshotView),
  thread_view: m(z.object({ threadId: z.string().nullable() }), typed<PillView>()),
  pill_config: m(z.null(), z.object({ showPill: z.boolean(), pillFallback: z.enum(["minimum", "hidden"]) })),
  sources_list: m(z.null(), z.object({ sources: z.array(httpSourceSchema), presets: typed<typeof PRESETS>() })),
  source_save: m(httpSourceSchema, z.object({ source: httpSourceSchema })),
  source_delete: m(z.object({ id: z.string() }), z.object({ removed: z.boolean() })),
  source_test: m(
    httpSourceSchema,
    z.object({ reading: typed<AccountReading>(), fieldPaths: z.array(z.string()) }),
  ),
  overrides_get: m(z.null(), overridesSchema),
  overrides_set: m(overridesSchema, overridesSchema),
  discovered: m(z.null(), z.object({ tree: typed<ProviderNode[]>() })),
});

export type { HttpSource };
