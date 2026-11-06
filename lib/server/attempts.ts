// lib/server/attempts.ts
//
// Атомарний облік спроб у D1 (таблиця auth_attempts). Раніше «порахувати, потім записати» були двома запитами:
// паралельні звернення всі бачили «ще є місце» й проходили понад ліміт. Тепер це один INSERT ... SELECT з умовою:
// SQLite виконує оператор цілком, тож двоє одночасних не отримають останнє місце обидва. Немає рядка у відповіді,
// отже ліміт вичерпано.

import { sql } from "drizzle-orm";
import type { Db } from "./db";

export type AttemptKind = "email_start" | "email_verify_fail" | "rate";

export interface AttemptSpec {
  key: string;
  kind: AttemptKind;
  max: number;
  windowMs: number;
  at?: number;
}

/** Резервує спробу, якщо за вікно їх менше за `max`. Повертає id запису або null, коли ліміт вичерпано. */
export const takeAttempt = async (db: Db, spec: AttemptSpec): Promise<number | null> => {
  const { key, kind, max, windowMs, at = Date.now() } = spec;
  const rows = await db.all<{ id: number }>(sql`
    INSERT INTO auth_attempts (key, kind, created_at)
    SELECT ${key}, ${kind}, ${at}
    WHERE (SELECT count(*) FROM auth_attempts WHERE key = ${key} AND kind = ${kind} AND created_at > ${at - windowMs}) < ${max}
    RETURNING id`);
  return rows[0]?.id ?? null;
};

/** Повертає зарезервовану спробу (успішний вхід не повинен рахуватися помилкою). */
export const releaseAttempt = async (db: Db, id: number): Promise<void> => {
  await db.run(sql`DELETE FROM auth_attempts WHERE id = ${id}`);
};
