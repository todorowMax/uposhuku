// lib/server/telegram-repo.ts
//
// Прив'язка акаунта до Telegram. Людина на сайті просить посилання,
// переходить по ньому в бота й натискає Start: токен із посилання
// (одноразовий, 15 хвилин) каже, чий це чат. Один Telegram — один акаунт.

import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { telegramLinkTokens, telegramLinks, telegramUpdates } from "@/db/schema";
import { sha256Hex } from "@/kit/telemetry/core";
import { getDb } from "./db";

export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 24 випадкові байти в base64url: Telegram дозволяє в `start` до 64 символів `A-Za-z0-9_-`. */
const newToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Новий токен прив'язки. Попередні невикористані токени людини гаснуть. */
export const createLinkToken = async (userId: string, now = Date.now()): Promise<{ token: string; expiresAt: number }> => {
  const db = getDb();
  const token = newToken();
  await db.batch([
    db.delete(telegramLinkTokens).where(and(eq(telegramLinkTokens.userId, userId), isNull(telegramLinkTokens.usedAt))),
    db.insert(telegramLinkTokens).values({ tokenHash: await sha256Hex(token), userId, expiresAt: now + LINK_TOKEN_TTL_MS }),
  ]);
  return { token, expiresAt: now + LINK_TOKEN_TTL_MS };
};

export interface TelegramChatInfo {
  chatId: string;
  username?: string | null;
  firstName?: string | null;
}

export type LinkResult = { ok: true; userId: string; replacedOtherAccount: boolean } | { ok: false };

/** Закриває токен і прив'язує чат. Токен одноразовий: другий раз той самий не спрацює. */
export const consumeLinkToken = async (token: string, chat: TelegramChatInfo, now = Date.now()): Promise<LinkResult> => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false };
  const db = getDb();
  const hash = await sha256Hex(token);
  const [row] = await db
    .select()
    .from(telegramLinkTokens)
    .where(and(eq(telegramLinkTokens.tokenHash, hash), isNull(telegramLinkTokens.usedAt), gt(telegramLinkTokens.expiresAt, now)))
    .limit(1);
  if (!row) return { ok: false };

  // Атомарно «забираємо» токен: дві паралельні відповіді не пройдуть обидві.
  const claimed = await db
    .update(telegramLinkTokens)
    .set({ usedAt: now })
    .where(and(eq(telegramLinkTokens.tokenHash, hash), isNull(telegramLinkTokens.usedAt)))
    .returning({ tokenHash: telegramLinkTokens.tokenHash });
  if (claimed.length === 0) return { ok: false };

  // Цей Telegram міг бути прив'язаний до іншого акаунта: один чат — один акаунт.
  const others = await db.select({ userId: telegramLinks.userId }).from(telegramLinks).where(and(eq(telegramLinks.chatId, chat.chatId), ne(telegramLinks.userId, row.userId)));
  const values = { chatId: chat.chatId, username: chat.username ?? null, firstName: chat.firstName ?? null, active: true, linkedAt: now, blockedAt: null };
  await db.batch([
    db.delete(telegramLinks).where(and(eq(telegramLinks.chatId, chat.chatId), ne(telegramLinks.userId, row.userId))),
    db.insert(telegramLinks).values({ userId: row.userId, ...values }).onConflictDoUpdate({ target: telegramLinks.userId, set: values }),
  ]);
  return { ok: true, userId: row.userId, replacedOtherAccount: others.length > 0 };
};

export type TelegramLink = typeof telegramLinks.$inferSelect;

export const getLink = async (userId: string): Promise<TelegramLink | null> => (await getDb().select().from(telegramLinks).where(eq(telegramLinks.userId, userId)).limit(1))[0] ?? null;

/** Чат, куди можна писати: прив'язка є й активна. */
export const activeLink = async (userId: string): Promise<TelegramLink | null> => {
  const link = await getLink(userId);
  return link?.active ? link : null;
};

/** Вимкнути за чатом: /stop, або людина заблокувала бота (тоді ще й `blockedAt`). */
export const deactivateByChat = async (chatId: string, blocked = false, now = Date.now()): Promise<string | null> => {
  const [link] = await getDb().select().from(telegramLinks).where(eq(telegramLinks.chatId, chatId)).limit(1);
  if (!link) return null;
  await getDb().update(telegramLinks).set({ active: false, blockedAt: blocked ? now : link.blockedAt }).where(eq(telegramLinks.userId, link.userId));
  return link.userId;
};

/** Відключити з сайту. Повертає чат, щоб бот міг попрощатися. */
export const deactivateByUser = async (userId: string): Promise<TelegramLink | null> => {
  const link = await getLink(userId);
  if (!link) return null;
  await getDb().update(telegramLinks).set({ active: false }).where(eq(telegramLinks.userId, userId));
  return link;
};

/** Користувач за чатом: хто пише боту. */
export const linkByChat = async (chatId: string): Promise<TelegramLink | null> => (await getDb().select().from(telegramLinks).where(eq(telegramLinks.chatId, chatId)).limit(1))[0] ?? null;

/** Оновлення вже обробляли? Запам'ятовуємо, якщо ні. `true` — це повтор. */
export const seenUpdate = async (updateId: number, now = Date.now()): Promise<boolean> => {
  const inserted = await getDb().insert(telegramUpdates).values({ updateId, receivedAt: now }).onConflictDoNothing().returning({ updateId: telegramUpdates.updateId });
  return inserted.length === 0;
};

/** Прибирання старого: токени, що прострочені, і оновлення старші за добу. */
export const pruneTelegram = async (now = Date.now()): Promise<void> => {
  const db = getDb();
  await db.batch([
    db.delete(telegramLinkTokens).where(lt(telegramLinkTokens.expiresAt, now - DAY_MS)),
    db.delete(telegramUpdates).where(lt(telegramUpdates.receivedAt, now - DAY_MS)),
  ]);
};
