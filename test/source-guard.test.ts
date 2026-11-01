import { describe, expect, it } from "vitest";
import { presetKeyMismatch } from "../src/sources/guard";
import { PRESETS } from "../src/sources/presets";
import type { HttpSource } from "../src/types";

const ds: HttpSource = { id: "d", enabled: true, ...PRESETS.deepseek };
const pz: HttpSource = { id: "p", enabled: true, ...PRESETS.polza };

describe("presetKeyMismatch", () => {
  it("accepts untouched presets", () => {
    expect(presetKeyMismatch(ds)).toBeNull();
    expect(presetKeyMismatch(pz)).toBeNull();
  });
  it("rejects a preset slot paired with a foreign url", () => {
    expect(presetKeyMismatch({ ...ds, url: "https://evil.example/balance" })).toMatch(/deepseekApiKey/);
    expect(presetKeyMismatch({ ...pz, url: "https://evil.example/b" })).toMatch(/polzaApiKey/);
  });
  it("rejects a preset source using another preset's slot on a foreign url", () => {
    expect(presetKeyMismatch({ ...ds, keySlot: "polzaApiKey", url: "https://x.example/b" })).toMatch(/polzaApiKey/);
  });
  it("pins named slots even when preset is null", () => {
    expect(presetKeyMismatch({ ...ds, preset: null, url: "https://x.example/b" })).toMatch(/deepseekApiKey/);
    expect(presetKeyMismatch({ ...pz, preset: null, url: "https://x.example/b" })).toMatch(/polzaApiKey/);
    expect(presetKeyMismatch({ ...ds, preset: null })).toBeNull();
  });
  it("allows custom slots with any url", () => {
    expect(presetKeyMismatch({ ...ds, preset: null, keySlot: "customKey1", url: "https://x.example/b" })).toBeNull();
  });
});
