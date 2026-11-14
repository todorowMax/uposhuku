// lib/server/phone-repo.ts
//
// Телефон замовника. Зберігаємо лише HMAC номера (lib/phone/hash.ts), маску й час підтвердження; номер у базу й журнал
// не потрапляє. Правила: номер у блок-листі (`phone_blocks`) не підтверджується; на другому живому акаунті теж; «могила»
// видаленого акаунта з боргом комісії тримає номер (він не звільняється), без боргу віддає його новому акаунту.
// Бану користувачів у проєкті немає, тож «заблокований» це блок-лист і борг.

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { feeEntries, phoneBlocks, users } from "@/db/schema";
import { maskPhone } from "@/lib/phone/format";
import { phoneHash } from "@/lib/phone/hash";
import { logServer } from "@/lib/telemetry/log";
import { getDb } from "./db";
import { featureEnabledFor } from "./features";
import { readVar } from "./env";

export type BindResult = "ok" | "taken" | "blocked" | "locked" | "unavailable";

export interface PhoneStatus {
  verified: boolean;
  mask: string | null;
  verifiedAt: number | null;
}

/** Ключ хешів; без нього телефон не підтверджуємо. Запис у журнал без номера. */
export const phoneKey = (): string | null => {
  const key = readVar("PHONE_HASH_KEY")?.trim();
  if (key) return key;
  logServer({ level: "error", event: "phone_hash_key_missing", message: "PHONE_HASH_KEY не задано: телефон не підтверджується" });
  return null;
};

/** Борг комісії на акаунті: сума журналу більша за нуль. */
const owesFee = async (userIds: string[]): Promise<boolean> => {
  if (userIds.length === 0) return false;
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${feeEntries.amount}), 0)` })
    .from(feeEntries)
    .where(inArray(feeEntries.userId, userIds))
    .groupBy(feeEntries.userId)
    .having(sql`sum(${feeEntries.amount}) > 0`)
    .limit(1);
  return Boolean(row);
};

/**
 * Прив'язує підтверджений номер (E.164) до акаунта. `taken`: хеш у іншого живого акаунта. `blocked`: блок-лист чи могила з
 * боргом. `locked`: у людини вже підтверджений інший номер, самостійно його не міняємо (інакше боржник перепривʼязав би акаунт і звільнив старий номер). `unavailable`: немає ключа хешу. Могилу без боргу позбавляємо хеша, щоб власник був один.
 */
export const bindPhone = async (userId: string, e164: string, now = Date.now()): Promise<BindResult> => {
  const key = phoneKey();
  if (!key) return "unavailable";
  const hash = await phoneHash(e164, key);
  const db = getDb();
  const [own] = await db.select({ hash: users.phoneHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (own?.hash) return own.hash === hash ? "ok" : "locked";
  const [blocked] = await db.select({ hash: phoneBlocks.phoneHash }).from(phoneBlocks).where(eq(phoneBlocks.phoneHash, hash)).limit(1);
  if (blocked) return "blocked";
  const others = await db.select({ id: users.id, deletedAt: users.deletedAt }).from(users).where(and(eq(users.phoneHash, hash), ne(users.id, userId)));
  if (others.some((row) => row.deletedAt === null)) return "taken";
  const graves = others.map((row) => row.id);
  if (await owesFee(graves)) return "blocked";
  const bind = db.update(users).set({ phoneHash: hash, phoneMask: maskPhone(e164), phoneVerifiedAt: now }).where(and(eq(users.id, userId), sql`${users.deletedAt} is null`));
  if (graves.length === 0) await bind;
  else await db.batch([db.update(users).set({ phoneHash: null }).where(inArray(users.id, graves)), bind]);
  return "ok";
};

export const phoneStatus = async (userId: string): Promise<PhoneStatus> => {
  const [row] = await getDb().select({ mask: users.phoneMask, verifiedAt: users.phoneVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return { verified: Boolean(row?.verifiedAt), mask: row?.mask ?? null, verifiedAt: row?.verifiedAt ?? null };
};

/** Флаг увімкнений для цієї людини, а номер ще не підтверджено. */
export const isPhoneRequired = async (user: { id: string; email: string }): Promise<boolean> =>
  (await featureEnabledFor("phone_verify", user.email)) && !(await phoneStatus(user.id)).verified;
