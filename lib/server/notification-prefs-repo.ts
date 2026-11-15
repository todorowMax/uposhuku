// lib/server/notification-prefs-repo.ts
import { eq, inArray } from "drizzle-orm";
import { notificationPreferences } from "@/db/schema";
import { DEFAULT_PREFS, mergePrefs, parsePrefs, type NotificationPrefs } from "@/lib/notification-prefs";
import { getDb, inChunks } from "./db";

const read = (json: string): NotificationPrefs => {
  try {
    return parsePrefs(JSON.parse(json));
  } catch {
    return DEFAULT_PREFS;
  }
};

/** Налаштування людини. Немає рядка: значення за замовчуванням. */
export const getPrefs = async (userId: string): Promise<NotificationPrefs> => {
  const [row] = await getDb().select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  return row ? read(row.prefs) : DEFAULT_PREFS;
};

/** Збережені налаштування кількох людей; хто нічого не зберігав, у мапі відсутній (діють типові). */
export const getPrefsMap = async (userIds: string[]): Promise<Map<string, NotificationPrefs>> => {
  const rows = await inChunks(userIds, (chunk) => getDb().select().from(notificationPreferences).where(inArray(notificationPreferences.userId, chunk)));
  return new Map(rows.map((row) => [row.userId, read(row.prefs)]));
};

/** Чи збережено щось колись: за цим клієнт вирішує, чи переносити вибір із localStorage. */
export const hasStoredPrefs = async (userId: string): Promise<boolean> =>
  (await getDb().select({ userId: notificationPreferences.userId }).from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1)).length > 0;

/** Часткове оновлення зливається з поточним. */
export const savePrefs = async (userId: string, patch: unknown, now = Date.now()): Promise<NotificationPrefs> => {
  const next = mergePrefs(await getPrefs(userId), patch);
  const values = { prefs: JSON.stringify(next), updatedAt: now };
  await getDb().insert(notificationPreferences).values({ userId, ...values }).onConflictDoUpdate({ target: notificationPreferences.userId, set: values });
  return next;
};
