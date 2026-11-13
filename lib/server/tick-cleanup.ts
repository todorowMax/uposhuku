// lib/server/tick-cleanup.ts
//
// Прибирання, яке робить cron (app/api/internal/tick): прострочені сесії й коди входу та приймання, осиротілі фото чату.
// Кожна функція самостійна і повертає, скільки рядків прибрала; крок у tick обгорнуто в try/catch окремо.

import { and, inArray, isNull, lt, or } from "drizzle-orm";
import { chatAttachments, dealReleaseCodes, emailCodes, sessions } from "@/db/schema";
import { SESSION_IDLE_MS } from "@/lib/auth/config";
import { getDb } from "./db";
import { getBucket } from "./uploads";

/** Фото чату без повідомлення, старші за добу, вважаємо осиротілими (так само рахує `saveChatPhoto`). */
export const ORPHAN_ATTACHMENT_MS = 24 * 60 * 60 * 1000;
/** За прохід не більше стільки фото: R2 і D1 не затримуємо, решта піде наступного разу. */
export const ORPHAN_BATCH = 200;

/** Сесії: прострочені за `expiresAt` або без звернень довше 14 днів (їх `getSessionUser` і так не пустить). */
export const pruneSessions = async (now = Date.now()): Promise<number> =>
  (await getDb().delete(sessions).where(or(lt(sessions.expiresAt, now), lt(sessions.lastSeenAt, now - SESSION_IDLE_MS))).returning({ id: sessions.id })).length;

/** Коди входу з пошти, строк яких вийшов. */
export const pruneEmailCodes = async (now = Date.now()): Promise<number> => (await getDb().delete(emailCodes).where(lt(emailCodes.expiresAt, now)).returning({ id: emailCodes.id })).length;

/** Коди приймання великого етапу, строк яких вийшов. */
export const pruneReleaseCodes = async (now = Date.now()): Promise<number> =>
  (await getDb().delete(dealReleaseCodes).where(lt(dealReleaseCodes.expiresAt, now)).returning({ id: dealReleaseCodes.id })).length;

/** Фото чату, які так і не прикріпили до повідомлення: файл у R2 і рядок у базі. Спершу R2: рядок лишається, якщо видалення не вдалось. */
export const pruneOrphanAttachments = async (now = Date.now()): Promise<number> => {
  const db = getDb();
  const orphans = await db
    .select({ id: chatAttachments.id, key: chatAttachments.key })
    .from(chatAttachments)
    .where(and(isNull(chatAttachments.messageId), lt(chatAttachments.createdAt, now - ORPHAN_ATTACHMENT_MS)))
    .limit(ORPHAN_BATCH);
  if (orphans.length === 0) return 0;
  await getBucket().delete(orphans.map((row) => row.key));
  await db.delete(chatAttachments).where(inArray(chatAttachments.id, orphans.map((row) => row.id)));
  return orphans.length;
};
