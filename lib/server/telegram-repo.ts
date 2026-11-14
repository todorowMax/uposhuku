// lib/server/telegram-repo.ts
//
// Прив'язка акаунта до Telegram. Людина на сайті просить посилання,
// переходить по ньому в бота й натискає Start: токен із посилання
// (одноразовий, 15 хвилин) каже, чий це чат. Один Telegram — один акаунт.

import { and, eq, gt, isNull, like, lt, ne } from "drizzle-orm";
import { telegramLinkTokens, telegramLinks, telegramUpdates } from "@/db/schema";
import { sha256Hex } from "@/kit/telemetry/core";
import { getDb } from "./db";

/** Навіщо токен: звичайна прив'язка (null) або прив'язка перед підтвердженням телефону (бот одразу просить контакт). */
export type LinkPurpose = "phone" | null;

export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 24 випадкові байти в base64url: Telegram дозволяє в `start` до 64 символів `A-Za-z0-9_-`. */
const newToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Новий токен прив'язки. Попередні невикористані токени людини гаснуть. */
export const createLinkToken = async (userId: string, now = Date.now(), purpose: LinkPurpose = null): Promise<{ token: string; expiresAt: number }> => {
  const db = getDb();
  const token = newToken();
  await db.batch([
    db.delete(telegramLinkTokens).where(and(eq(telegramLinkTokens.userId, userId), isNull(telegramLinkTokens.usedAt))),
    db.insert(telegramLinkTokens).values({ tokenHash: await sha256Hex(token), userId, expiresAt: now + LINK_TOKEN_TTL_MS, purpose }),
  ]);
  return { token, expiresAt: now + LINK_TOKEN_TTL_MS };
};

export interface TelegramChatInfo {
  chatId: string;
  username?: string | null;
  firstName?: string | null;
}

/**
 * `ok: false` без `confirmId`: токен недійсний. З `confirmId`: цей чат уже прив'язаний до іншого акаунта, токен ще не
 * витрачено, а бот має спитати власника чату кнопкою (`confirmRelink` / `cancelRelink`).
 */
export type LinkResult = { ok: true; userId: string; replacedOtherAccount: boolean; purpose: LinkPurpose } | { ok: false; confirmId?: string };

/** Скільки символів хеша токена йде в `callback_data` кнопки (ліміт Telegram 64 байти разом із префіксом дії). */
const CONFIRM_ID_LENGTH = 40;

const findLiveToken = async (where: ReturnType<typeof and>) => (await getDb().select().from(telegramLinkTokens).where(and(where, isNull(telegramLinkTokens.usedAt))).limit(1))[0] ?? null;

/** Забирає чат собі: чужу прив'язку цього чату знімає, власну оновлює. Токен уже витрачено. */
const bindChat = async (owner: { userId: string; purpose: LinkPurpose }, chat: TelegramChatInfo, now: number): Promise<LinkResult> => {
  const { userId, purpose } = owner;
  const db = getDb();
  const others = await db.select({ userId: telegramLinks.userId }).from(telegramLinks).where(and(eq(telegramLinks.chatId, chat.chatId), ne(telegramLinks.userId, userId)));
  const values = { chatId: chat.chatId, username: chat.username ?? null, firstName: chat.firstName ?? null, active: true, linkedAt: now, blockedAt: null };
  await db.batch([
    db.delete(telegramLinks).where(and(eq(telegramLinks.chatId, chat.chatId), ne(telegramLinks.userId, userId))),
    db.insert(telegramLinks).values({ userId, ...values }).onConflictDoUpdate({ target: telegramLinks.userId, set: values }),
  ]);
  return { ok: true, userId, replacedOtherAccount: others.length > 0, purpose };
};

/** Атомарно «забирає» токен: дві паралельні відповіді не пройдуть обидві. */
const claimToken = async (hash: string, now: number): Promise<boolean> =>
  (await getDb().update(telegramLinkTokens).set({ usedAt: now }).where(and(eq(telegramLinkTokens.tokenHash, hash), isNull(telegramLinkTokens.usedAt))).returning({ tokenHash: telegramLinkTokens.tokenHash })).length > 0;

/** Якщо прив'язка не вдалася після того, як токен забрали, токен повертається: повторне оновлення Telegram спробує ще раз. */
const bindClaimed = async (row: { tokenHash: string; userId: string; purpose: string | null }, chat: TelegramChatInfo, now: number): Promise<LinkResult> => {
  try {
    return await bindChat({ userId: row.userId, purpose: row.purpose === "phone" ? "phone" : null }, chat, now);
  } catch (error) {
    await getDb().update(telegramLinkTokens).set({ usedAt: null }).where(eq(telegramLinkTokens.tokenHash, row.tokenHash));
    throw error;
  }
};

/**
 * Прив'язує чат за токеном. Токен одноразовий: другий раз той самий не спрацює. Якщо чат уже належить іншому акаунту,
 * мовчки його не забираємо (за чужою ланкою так можна було б відключити жертву): повертаємо `confirmId`, токен лишається.
 */
export const consumeLinkToken = async (token: string, chat: TelegramChatInfo, now = Date.now()): Promise<LinkResult> => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { ok: false };
  const hash = await sha256Hex(token);
  const row = await findLiveToken(and(eq(telegramLinkTokens.tokenHash, hash), gt(telegramLinkTokens.expiresAt, now)));
  if (!row) return { ok: false };
  const [other] = await getDb().select({ userId: telegramLinks.userId }).from(telegramLinks).where(and(eq(telegramLinks.chatId, chat.chatId), ne(telegramLinks.userId, row.userId))).limit(1);
  if (other) return { ok: false, confirmId: hash.slice(0, CONFIRM_ID_LENGTH) };
  if (!(await claimToken(hash, now))) return { ok: false };
  return bindClaimed(row, chat, now);
};

const liveTokenByConfirmId = async (confirmId: string, now: number) =>
  /^[0-9a-f]{40}$/.test(confirmId) ? findLiveToken(and(like(telegramLinkTokens.tokenHash, `${confirmId}%`), gt(telegramLinkTokens.expiresAt, now))) : null;

/** Власник чату підтвердив кнопкою: тепер чат переходить до акаунта з токена. */
export const confirmRelink = async (confirmId: string, chat: TelegramChatInfo, now = Date.now()): Promise<LinkResult> => {
  const row = await liveTokenByConfirmId(confirmId, now);
  if (!row || !(await claimToken(row.tokenHash, now))) return { ok: false };
  return bindClaimed(row, chat, now);
};

/** Власник чату відмовився: токен спалено, прив'язка лишається як була. */
export const cancelRelink = async (confirmId: string, now = Date.now()): Promise<void> => {
  const row = await liveTokenByConfirmId(confirmId, now);
  if (row) await claimToken(row.tokenHash, now);
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

/** Це оновлення вже оброблено? Лише читає: позначає `markUpdateSeen` після обробки, а не до неї. */
export const isUpdateSeen = async (updateId: number): Promise<boolean> =>
  (await getDb().select({ updateId: telegramUpdates.updateId }).from(telegramUpdates).where(eq(telegramUpdates.updateId, updateId)).limit(1)).length > 0;

/** Позначає оновлення (або службовий ключ) обробленим. `true`, якщо запис новий. */
export const markUpdateSeen = async (updateId: number, now = Date.now()): Promise<boolean> =>
  (await getDb().insert(telegramUpdates).values({ updateId, receivedAt: now }).onConflictDoNothing().returning({ updateId: telegramUpdates.updateId })).length > 0;

/** Прибирання старого: токени, що прострочені, і оновлення старші за добу. */
export const pruneTelegram = async (now = Date.now()): Promise<void> => {
  const db = getDb();
  await db.batch([
    db.delete(telegramLinkTokens).where(lt(telegramLinkTokens.expiresAt, now - DAY_MS)),
    db.delete(telegramUpdates).where(lt(telegramUpdates.receivedAt, now - DAY_MS)),
  ]);
};
