import { httpSourceSchema } from "./sources/http";
import type { HttpSource } from "./types";

type Preset = Omit<HttpSource, "id" | "enabled">;
export type DraftResult = { ok: true; source: HttpSource } | { ok: false; errors: Record<string, string> };

export function draftFromPreset(preset: Preset, id: string): HttpSource {
  return { ...preset, id, enabled: true };
}

export function emptyDraft(id: string): HttpSource {
  return {
    id,
    preset: null,
    providerName: "",
    organization: null,
    url: "https://",
    keySlot: "customKey1",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    amountPath: "",
    currencyPath: null,
    currencyFixed: null,
    modelPath: null,
    organizationPath: null,
    enabled: true,
  };
}

const NULLABLE = ["organization", "currencyPath", "currencyFixed", "modelPath", "organizationPath"] as const;
const TRIMMED = ["providerName", "url", "amountPath"] as const;

const FIELD_MESSAGES: Record<string, string> = {
  providerName: "укажите название провайдера",
  url: "только https без логина и пароля",
  authHeader: "заголовок без пробелов, переводов строки и двоеточия",
  authPrefix: "без переводов строки",
  keySlot: "выберите поле с ключом",
  preset: "неверный пресет",
};

function check(draft: unknown, requireAmount: boolean): DraftResult {
  if (typeof draft !== "object" || draft === null || Array.isArray(draft)) {
    return { ok: false, errors: { form: "неверные данные формы" } };
  }
  const d: Record<string, unknown> = { ...(draft as Record<string, unknown>) };
  for (const k of NULLABLE) {
    const v = d[k];
    if (typeof v === "string") d[k] = v.trim() === "" ? null : v.trim();
  }
  for (const k of TRIMMED) if (typeof d[k] === "string") d[k] = (d[k] as string).trim();

  const errors: Record<string, string> = {};
  const parsed = httpSourceSchema.safeParse(d);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = typeof issue.path[0] === "string" ? issue.path[0] : "form";
      if (!(field in errors)) errors[field] = FIELD_MESSAGES[field] ?? "неверное значение";
    }
  }
  if (d.currencyPath === null && d.currencyFixed === null) {
    errors.currencyFixed = "укажите путь к валюте или валюту";
  }
  if (requireAmount && (typeof d.amountPath !== "string" || d.amountPath.trim() === "")) {
    errors.amountPath = "укажите путь к сумме";
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, source: parsed.data };
}

/** Full check for Save. */
export function validateDraft(draft: unknown): DraftResult {
  return check(draft, true);
}

/** Looser check for «Проверить»: an empty amountPath is allowed, since that is how paths are discovered. */
export function validateDraftForTest(draft: unknown): DraftResult {
  return check(draft, false);
}
