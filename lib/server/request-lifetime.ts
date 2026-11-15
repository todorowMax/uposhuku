// lib/server/request-lifetime.ts
//
// Строк життя запиту на D1 (правила: lib/requests/lifetime.ts). Крок tick у два етапи: питаємо автора «Ще актуально?»
// через 14 днів і закриваємо запит, на питання якого не відповіли за 3 дні. Обидва етапи ідемпотентні: рядок «забирається»
// умовним UPDATE, тож повторний tick чи два паралельні нічого не дублюють. Виконавцям нічого не йде.

import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { requests } from "@/db/schema";
import { stripContacts } from "@/lib/chat/contacts";
import { RENEW_AFTER_MS, RENEW_ANSWER_MS, lifetimeStart } from "@/lib/requests/lifetime";
import type { PublishedRequest } from "@/lib/requests/types";
import { renewNotice } from "@/lib/telegram/notices";
import { excerpt } from "@/lib/telegram/texts";
import { getDb } from "./db";
import { notifyUser } from "./notify";
import { findRequest } from "./request-repo";

/** Скільки запитів обробляє один tick на кожному етапі: решта дочекається наступного (раз на 5 хвилин). */
export const LIFETIME_BATCH = 25;

const startExpr = sql`coalesce(${requests.renewedAt}, ${requests.createdAt})`;

/** «Ще актуально?» автору запиту, що прожив 14 днів. Повертає, скільком запитам поставили питання. */
export const askRenewals = async (now = Date.now()): Promise<number> => {
  const db = getDb();
  const due = await db
    .select({ id: requests.id, userId: requests.userId, text: requests.text, createdAt: requests.createdAt, renewedAt: requests.renewedAt })
    .from(requests)
    .where(and(eq(requests.status, "open"), isNull(requests.renewalAskedAt), sql`${startExpr} <= ${now - RENEW_AFTER_MS}`))
    .orderBy(asc(startExpr))
    .limit(LIFETIME_BATCH);
  let asked = 0;
  for (const row of due) {
    // Спершу займаємо запит: хто встиг першим, той і питає, повтор нічого не шле.
    const claimed = await db
      .update(requests)
      .set({ renewalAskedAt: now })
      .where(and(eq(requests.id, row.id), eq(requests.status, "open"), isNull(requests.renewalAskedAt)))
      .returning({ id: requests.id });
    if (claimed.length === 0) continue;
    asked++;
    await notifyUser(row.userId, renewNotice({ requestId: row.id, userId: row.userId, since: lifetimeStart(row), title: excerpt(stripContacts(row.text), 60) }), now);
  }
  return asked;
};

/** Закриває запити, на питання «Ще актуально?» яких не відповіли за 3 дні: причина `expired`, `closed_at` ставиться як при звичайному закритті. */
export const expireUnanswered = async (now = Date.now()): Promise<number> => {
  const db = getDb();
  const late = and(eq(requests.status, "open"), isNotNull(requests.renewalAskedAt), lte(requests.renewalAskedAt, now - RENEW_ANSWER_MS));
  const ids = await db.select({ id: requests.id }).from(requests).where(late).orderBy(asc(requests.renewalAskedAt)).limit(LIFETIME_BATCH);
  let closed = 0;
  for (const { id } of ids) {
    const done = await db
      .update(requests)
      .set({ status: "closed", closedAt: now, closeReason: "expired" })
      .where(and(eq(requests.id, id), late))
      .returning({ id: requests.id });
    closed += done.length;
  }
  return closed;
};

/**
 * «Так, ще актуально»: строк життя рахується від нині, питання знімається. Лише свій відкритий запит; виконавців не сповіщаємо,
 * стрічку не чіпаємо. Чужий чи неіснуючий: not_found, закритий: closed.
 */
export const renewRequest = async (userId: string, id: string, now = Date.now()): Promise<PublishedRequest | "not_found" | "closed"> => {
  const own = await findRequest(userId, id);
  if (!own) return "not_found";
  if (own.status !== "open") return "closed";
  await getDb()
    .update(requests)
    .set({ renewedAt: now, renewalAskedAt: null })
    .where(and(eq(requests.id, id), eq(requests.userId, userId), eq(requests.status, "open")));
  return (await findRequest(userId, id)) ?? "not_found";
};
