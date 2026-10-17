// lib/telegram/channel.ts
//
// Публічний канал запитів. Запит потрапляє туди через CHANNEL_DELAY_MIN хвилин
// після публікації (спершу «перша хвиля» виконавцям у особисті), без контактів,
// з кнопкою «Відгукнутися на Findlyfy»: відгукнутися можна лише на платформі.
// Коли запит закрито, пост редагується: «Виконавця знайдено».

import { and, eq, gt, inArray, lt, notInArray, sql } from "drizzle-orm";
import { channelPosts, requestTags, requests } from "@/db/schema";
import { stripContacts } from "@/lib/chat/contacts";
import { CITIES } from "@/lib/map/cities";
import { DEADLINES, isDeadline } from "@/lib/requests/types";
import { getDb } from "@/lib/server/db";
import { logServer } from "@/lib/telemetry/log";
import { editMessageText, sendMessage, TelegramError } from "./api";
import { telegramConfig, type TelegramConfig } from "./config";
import { deepLink } from "./notices";
import { escapeHtml, excerpt } from "./texts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Скільки постів за один запуск: у каналу Telegram ліміт 20 повідомлень на хвилину. */
export const POSTS_PER_RUN = 10;
/** Не більше постів від однієї людини за добу: захист від спаму каналу. */
export const POSTS_PER_USER_PER_DAY = 3;
const TEXT_MAX = 400;
const HASHTAGS_MAX = 4;

export interface ChannelRequest {
  id: string;
  text: string;
  budget: number | null;
  deadline: string | null;
  cityId: string | null;
  tags: { id: string; label: string }[];
}

/** «Telegram-бот» → #telegram_бот. Лише літери, цифри й підкреслення: інше Telegram у хештег не бере. */
export const hashtag = (label: string): string => {
  const clean = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  return clean ? `#${clean}` : "";
};

/** Текст поста й кнопка. `closed`: запит закрито, кнопки немає. */
export const formatChannelPost = (request: ChannelRequest, options: { closed?: boolean } = {}): { html: string; button: { text: string; path: string } | null } => {
  const tags = [...new Set(request.tags.map((tag) => hashtag(tag.label)).filter(Boolean))].slice(0, HASHTAGS_MAX).join(" ");
  const city = CITIES.find((item) => item.id === request.cityId)?.name ?? "Віддалено";
  const facts = [
    request.budget ? `💰 до ${new Intl.NumberFormat("uk-UA").format(request.budget).replace(/[\u00a0\u202f]/g, " ")} ₴` : null,
    `📍 ${city}`,
    isDeadline(request.deadline) ? `⏱ ${DEADLINES[request.deadline]}` : null,
  ].filter(Boolean);
  const html = [
    options.closed ? "✅ <b>Виконавця знайдено</b>" : null,
    tags ? escapeHtml(tags) : null,
    escapeHtml(excerpt(stripContacts(request.text), TEXT_MAX)),
    escapeHtml(facts.join(" · ")),
  ]
    .filter((part) => part !== null && part !== "")
    .join("\n\n");
  return { html, button: options.closed ? null : { text: "Відгукнутися на Findlyfy", path: deepLink(`request:${request.id}`, "channel") } };
};

const keyboard = (config: TelegramConfig, button: { text: string; path: string } | null) => (button ? { inline_keyboard: [[{ text: button.text, url: `${config.siteUrl}${button.path}` }]] } : undefined);

const withTags = async (rows: { id: string; text: string; budget: number | null; deadline: string | null; cityId: string | null }[]): Promise<ChannelRequest[]> => {
  if (rows.length === 0) return [];
  const tags = await getDb().select().from(requestTags).where(inArray(requestTags.requestId, rows.map((row) => row.id)));
  return rows.map((row) => ({ ...row, tags: tags.filter((tag) => tag.requestId === row.id).map((tag) => ({ id: tag.tagId, label: tag.label })) }));
};

/** Публікація запитів у каналі увімкнена і налаштована. */
export const channelReady = (config: TelegramConfig): boolean => config.enabled && config.channelEnabled && Boolean(config.channelId);

/** Запити, які пора постити: відкриті, дозволені людиною, дозрілі за затримкою, ще не запощені. */
export const duePosts = async (config: TelegramConfig, now: number): Promise<ChannelRequest[]> => {
  const db = getDb();
  const delay = config.channelDelayMin * 60_000;
  const posted = db.select({ id: channelPosts.requestId }).from(channelPosts);
  const candidates = await db
    .select({ id: requests.id, userId: requests.userId, text: requests.text, budget: requests.budget, deadline: requests.deadline, cityId: requests.cityId })
    .from(requests)
    .where(and(eq(requests.status, "open"), eq(requests.channelOptIn, true), lt(requests.createdAt, now - delay + 1), gt(requests.createdAt, now - DAY_MS), notInArray(requests.id, posted)))
    .orderBy(requests.createdAt)
    .limit(POSTS_PER_RUN * 5);
  if (candidates.length === 0) return [];

  // Скільки постів від кожного автора вже було за добу, щоб один не заспамив канал.
  const perUser = new Map<string, number>();
  const recent = await db
    .select({ userId: requests.userId, total: sql<number>`count(*)` })
    .from(channelPosts)
    .innerJoin(requests, eq(requests.id, channelPosts.requestId))
    .where(and(gt(channelPosts.postedAt, now - DAY_MS), inArray(channelPosts.status, ["posted", "closed"])))
    .groupBy(requests.userId);
  for (const row of recent) perUser.set(row.userId, Number(row.total));

  const chosen: typeof candidates = [];
  for (const candidate of candidates) {
    if (chosen.length >= POSTS_PER_RUN) break;
    const used = perUser.get(candidate.userId) ?? 0;
    if (used >= POSTS_PER_USER_PER_DAY) continue;
    perUser.set(candidate.userId, used + 1);
    chosen.push(candidate);
  }
  return withTags(chosen);
};

export interface ChannelRunResult {
  posted: number;
  failed: number;
  closed: number;
}

/** Постить дозрілі запити. Помилка одного не зупиняє решту, крім ліміту Telegram. */
export const postDueRequests = async (now = Date.now(), config = telegramConfig()): Promise<Pick<ChannelRunResult, "posted" | "failed">> => {
  const result = { posted: 0, failed: 0 };
  if (!channelReady(config)) return result;
  const chatId = config.channelId as string;
  const db = getDb();
  for (const request of await duePosts(config, now)) {
    const { html, button } = formatChannelPost(request);
    try {
      const message = await sendMessage(chatId, html, { keyboard: keyboard(config, button) });
      await db.insert(channelPosts).values({ requestId: request.id, chatId, messageId: message.message_id, status: "posted", postedAt: now, updatedAt: now }).onConflictDoNothing();
      result.posted++;
    } catch (error) {
      // Ліміт Telegram: зупиняємось, запит лишиться для наступного запуску (рядка в базі немає).
      if (error instanceof TelegramError && error.code === 429) break;
      const message = error instanceof Error ? error.message : String(error);
      // Інакше фіксуємо відмову й не повторюємо: той самий текст упреться в те саме.
      await db.insert(channelPosts).values({ requestId: request.id, chatId, messageId: null, status: "failed", postedAt: now, updatedAt: now, error: message.slice(0, 300) }).onConflictDoNothing();
      logServer({ level: "error", event: "channel_post_failed", message, detail: { requestId: request.id } });
      result.failed++;
    }
  }
  return result;
};

/** Редагує пости закритих запитів: «Виконавця знайдено», без кнопки. */
export const closeFinishedPosts = async (now = Date.now(), config = telegramConfig()): Promise<number> => {
  if (!channelReady(config)) return 0;
  const db = getDb();
  const rows = await db
    .select({ id: requests.id, text: requests.text, budget: requests.budget, deadline: requests.deadline, cityId: requests.cityId, chatId: channelPosts.chatId, messageId: channelPosts.messageId })
    .from(channelPosts)
    .innerJoin(requests, eq(requests.id, channelPosts.requestId))
    .where(and(eq(channelPosts.status, "posted"), eq(requests.status, "closed")))
    .limit(POSTS_PER_RUN);
  let closed = 0;
  for (const row of await withTags(rows)) {
    const source = rows.find((item) => item.id === row.id)!;
    try {
      if (source.messageId !== null) await editMessageText(source.chatId, source.messageId, formatChannelPost(row, { closed: true }).html);
      await db.update(channelPosts).set({ status: "closed", updatedAt: now }).where(eq(channelPosts.requestId, row.id));
      closed++;
    } catch (error) {
      // «Повідомлення не змінилось» і «повідомлення видалили»: закриваємо запис, щоб не повторювати.
      if (error instanceof TelegramError && error.code === 400) {
        await db.update(channelPosts).set({ status: "closed", updatedAt: now, error: error.message.slice(0, 300) }).where(eq(channelPosts.requestId, row.id));
      } else if (error instanceof TelegramError && error.code === 429) break;
      else logServer({ level: "warn", event: "channel_close_failed", message: error instanceof Error ? error.message : String(error), detail: { requestId: row.id } });
    }
  }
  return closed;
};
