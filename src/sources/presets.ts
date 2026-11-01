import type { HttpSource } from "../types";

export const PRESETS: Record<"deepseek" | "polza", Omit<HttpSource, "id" | "enabled">> = {
  deepseek: {
    preset: "deepseek",
    providerName: "DeepSeek",
    organization: null,
    url: "https://api.deepseek.com/user/balance",
    keySlot: "deepseekApiKey",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    amountPath: "balance_infos[*].total_balance",
    currencyPath: "balance_infos[*].currency",
    currencyFixed: null,
    modelPath: null,
    organizationPath: null,
  },
  polza: {
    preset: "polza",
    providerName: "Polza",
    organization: null,
    url: "https://polza.ai/api/v2/balance",
    keySlot: "polzaApiKey",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    amountPath: "available",
    currencyPath: null,
    currencyFixed: "RUB",
    modelPath: null,
    organizationPath: null,
  },
};
