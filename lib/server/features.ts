// lib/server/features.ts
//
// Прапорці функцій на сервері. Значення береться з таблиці feature_flags, інакше зі змінних середовища
// (<ІМ'Я>_MODE і <ІМ'Я>_USERS, наприклад CRYPTO_PROOF_MODE), інакше функція вимкнена. Чисту логіку див.
// lib/features/flags.ts. Гроші, що вже в русі (вебхук, звірка, виплата), прапорців не питають.

import { eq } from "drizzle-orm";
import { featureFlags } from "@/db/schema";
import { FEATURES, featureAllowed, featureEnvPrefix, resolveFeature, type FeatureMode, type FeatureName, type FeatureSetting } from "@/lib/features/flags";
import { getDb } from "./db";
import { readVar } from "./env";

const envOf = (name: FeatureName) => {
  const prefix = featureEnvPrefix(name);
  return { mode: readVar(`${prefix}_MODE` as keyof CloudflareEnv), users: readVar(`${prefix}_USERS` as keyof CloudflareEnv) };
};

/** Поточне налаштування функції. */
export const featureSetting = async (name: FeatureName): Promise<FeatureSetting> => {
  const [row] = await getDb().select().from(featureFlags).where(eq(featureFlags.feature, name)).limit(1);
  return resolveFeature(row ?? null, envOf(name));
};

export const featureMode = async (name: FeatureName): Promise<FeatureMode> => (await featureSetting(name)).mode;

/** Чи доступна функція цій людині. */
export const featureEnabledFor = async (name: FeatureName, email: string | null | undefined): Promise<boolean> => featureAllowed(await featureSetting(name), email);

/** Усі дозволи однієї людини: це єдине, що дізнається клієнт. */
export const featuresFor = async (email: string | null | undefined): Promise<Record<FeatureName, boolean>> => {
  const rows = await getDb().select().from(featureFlags);
  const stored = new Map(rows.map((row) => [row.feature, row]));
  return Object.fromEntries(FEATURES.map((name) => [name, featureAllowed(resolveFeature(stored.get(name) ?? null, envOf(name)), email)])) as Record<FeatureName, boolean>;
};

/** Усі налаштування для адмінки, з джерелом значення. */
export const listFeatureSettings = async (): Promise<{ name: FeatureName; setting: FeatureSetting; source: "db" | "env" | "default"; updatedAt: number | null; updatedBy: string | null }[]> => {
  const rows = await getDb().select().from(featureFlags);
  const stored = new Map(rows.map((row) => [row.feature, row]));
  return FEATURES.map((name) => {
    const row = stored.get(name) ?? null;
    const env = envOf(name);
    return { name, setting: resolveFeature(row, env), source: row ? "db" : env.mode ? "env" : "default", updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
  });
};

/** Записує налаштування (хто змінив лишається в рядку). */
export const saveFeatureSetting = async (input: { name: FeatureName; setting: FeatureSetting; adminEmail: string; now?: number }): Promise<void> => {
  const { name, setting, adminEmail, now = Date.now() } = input;
  const values = { mode: setting.mode, users: setting.users.join(","), updatedBy: adminEmail, updatedAt: now };
  await getDb().insert(featureFlags).values({ feature: name, ...values }).onConflictDoUpdate({ target: featureFlags.feature, set: values });
};
