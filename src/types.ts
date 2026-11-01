export type Limit =
  | {
      kind: "window";
      id: string;
      label: string;
      remainingPercent: number;
      resetsAt: string | null;
      model: string | null;
    }
  | {
      kind: "balance";
      id: string;
      label: string;
      amount: number;
      currency: string;
      model: string | null;
    };

export type Device = { hostId: string; name: string } | { service: true };

export const KEY_SLOTS = [
  "deepseekApiKey",
  "polzaApiKey",
  "customKey1",
  "customKey2",
  "customKey3",
  "customKey4",
  "customKey5",
] as const;

export type KeySlot = (typeof KEY_SLOTS)[number];

export interface AccountReading {
  sourceId: string;
  providerId: string;
  accountIdentity: string | null;
  accountLabel: string | null;
  planLabel: string | null;
  device: Device;
  status: "ok" | "not_installed" | "unauthenticated" | "expired" | "error";
  message: string | null;
  offline: boolean;
  limits: Limit[];
  fetchedAt: string;
}

export interface HttpSource {
  id: string;
  preset: "deepseek" | "polza" | null;
  providerName: string;
  organization: string | null;
  url: string;
  keySlot: KeySlot;
  authHeader: string;
  authPrefix: string;
  amountPath: string;
  currencyPath: string | null;
  currencyFixed: string | null;
  modelPath: string | null;
  organizationPath: string | null;
  enabled: boolean;
}

export interface AccountNode {
  key: string;
  label: string | null;
  planLabel: string | null;
  devices: Device[];
  status: AccountReading["status"];
  message: string | null;
  offline: boolean;
  limits: Limit[];
  fetchedAt: string;
}

export interface ProviderNode {
  providerId: string;
  name: string;
  accounts: AccountNode[];
  hints: string[];
}

export interface Overrides {
  hidden: string[];
  names: Record<string, string>;
}
