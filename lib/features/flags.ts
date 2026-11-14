// lib/features/flags.ts
//
// Прапорці функцій: чисті функції без читання середовища та бази. Сервер збирає значення в lib/server/features.ts.
// Режими: off (нікому, типово), allowlist (лише пошти зі списку), on (всім). Невідоме значення це off:
// помилка в змінній не вмикає гроші.

export const FEATURES = ["safe_deal", "crypto_proof", "crypto_wallet", "crypto_escrow", "nbu_qr", "foreign_links", "postpaid_fee"] as const;
export type FeatureName = (typeof FEATURES)[number];

export type FeatureMode = "off" | "allowlist" | "on";
export const FEATURE_MODES: readonly FeatureMode[] = ["off", "allowlist", "on"];

export interface FeatureSetting {
  mode: FeatureMode;
  users: string[];
}

export const FEATURE_LABEL: Record<FeatureName, string> = {
  safe_deal: "Безпечна угода (Monobank)",
  crypto_proof: "USDT TRC-20 за хешем",
  crypto_wallet: "Оплата з крипто-гаманця",
  crypto_escrow: "Ескроу-контракт",
  nbu_qr: "QR переказу за форматом НБУ",
  foreign_links: "PayPal і Wise (посилання)",
  postpaid_fee: "Комісія за фактом (рахунок на акаунті)",
};

/** Зміна цих прапорців рухає гроші, тож потребує другого фактора (TOTP). QR переказу грошей не рухає. */
export const MONEY_FEATURES: readonly FeatureName[] = ["safe_deal", "crypto_proof", "crypto_wallet", "crypto_escrow", "foreign_links", "postpaid_fee"];

export const isFeatureName = (value: unknown): value is FeatureName => FEATURES.some((name) => name === value);
export const isMoneyFeature = (name: FeatureName): boolean => MONEY_FEATURES.includes(name);

export const parseFeatureMode = (raw: string | null | undefined): FeatureMode => {
  const value = raw?.trim().toLowerCase();
  return value === "allowlist" || value === "on" ? value : "off";
};

/** Пошти через кому чи з нових рядків, у нижньому регістрі, без порожніх і повторів. */
export const parseFeatureUsers = (raw: string | null | undefined): string[] =>
  [...new Set((raw ?? "").split(/[,\n;]/).map((item) => item.trim().toLowerCase()).filter(Boolean))];

/** Чи доступна функція цій пошті за цим налаштуванням. */
export const featureAllowed = (setting: FeatureSetting, email: string | null | undefined): boolean => {
  if (setting.mode === "on") return true;
  if (setting.mode === "off" || !email) return false;
  return setting.users.includes(email.trim().toLowerCase());
};

/** Значення з бази (якщо рядок є) важливіше за змінні середовища; без обох функція вимкнена. */
export const resolveFeature = (stored: { mode: string; users: string } | null, env: { mode?: string; users?: string }): FeatureSetting =>
  stored ? { mode: parseFeatureMode(stored.mode), users: parseFeatureUsers(stored.users) } : { mode: parseFeatureMode(env.mode), users: parseFeatureUsers(env.users) };

/** Префікс змінних середовища: SAFE_DEAL → SAFE_DEAL_MODE і SAFE_DEAL_USERS. */
export const featureEnvPrefix = (name: FeatureName): string => name.toUpperCase();
