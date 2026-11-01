import { describe, expect, it } from "vitest";
import { draftFromPreset, emptyDraft, validateDraft, validateDraftForTest } from "../src/source-draft";
import { PRESETS } from "../src/sources/presets";

describe("source draft", () => {
  it("draftFromPreset copies the preset and enables it", () => {
    expect(draftFromPreset(PRESETS.deepseek, "x")).toEqual({ ...PRESETS.deepseek, id: "x", enabled: true });
  });

  it("emptyDraft has header defaults", () => {
    const d = emptyDraft("y");
    expect(d).toMatchObject({
      id: "y",
      preset: null,
      authHeader: "Authorization",
      authPrefix: "Bearer ",
      keySlot: "customKey1",
      enabled: true,
    });
  });

  it("accepts a preset draft", () => {
    const r = validateDraft(draftFromPreset(PRESETS.polza, "p"));
    expect(r.ok).toBe(true);
  });

  it("rejects http url under url", () => {
    const r = validateDraft({ ...draftFromPreset(PRESETS.polza, "p"), url: "http://x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.url).toBeTruthy();
  });

  it("normalises empty strings to null and strips extra fields", () => {
    const r = validateDraft({
      ...draftFromPreset(PRESETS.deepseek, "d"),
      organization: "",
      currencyFixed: "",
      modelPath: "  ",
      organizationPath: "",
      extra: 1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source.organization).toBeNull();
      expect(r.source.currencyFixed).toBeNull();
      expect(r.source.modelPath).toBeNull();
      expect(r.source.organizationPath).toBeNull();
      expect("extra" in r.source).toBe(false);
    }
  });

  it("requires currency path or fixed currency", () => {
    const r = validateDraft({ ...emptyDraft("e"), providerName: "A", url: "https://a.b/c", amountPath: "x", currencyPath: "", currencyFixed: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.currencyFixed).toBe("укажите путь к валюте или валюту");
  });

  it("requires amountPath on save but not for test", () => {
    const d = { ...emptyDraft("e"), providerName: "A", url: "https://a.b/c", currencyFixed: "RUB" };
    const save = validateDraft(d);
    expect(save.ok).toBe(false);
    if (!save.ok) expect(save.errors.amountPath).toBe("укажите путь к сумме");
    expect(validateDraftForTest(d).ok).toBe(true);
  });

  it("rejects non-object input and keys errors by field", () => {
    expect(validateDraft(null).ok).toBe(false);
    const r = validateDraft({ ...emptyDraft("e"), providerName: "", authHeader: "a b" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.providerName).toBeTruthy();
      expect(r.errors.authHeader).toBeTruthy();
    }
  });
});
