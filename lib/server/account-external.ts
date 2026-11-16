// lib/server/account-external.ts
//
// Те, що при видаленні акаунта лежить поза основною базою: фото в R2, пост запиту в публічному Telegram-каналі, user_id у
// базі телеметрії. Спершу збираємо адреси (до видалення рядків), після успішного запису в базу прибираємо. Збій тут
// лише пишемо в журнал: акаунт уже видалено, а залишок підбере наступне прибирання вручну.

import { eq, inArray, and, isNotNull, or } from "drizzle-orm";
import { channelPosts, chatAttachments, requestFiles, requests } from "@/db/schema";
import { telemetryConfig } from "@/lib/telemetry/server";
import { logServer } from "@/lib/telemetry/log";
import { deleteMessage } from "@/lib/telegram/api";
import { telegramConfig } from "@/lib/telegram/config";
import { getDb, inChunks } from "./db";
import { getBucket, photoKeyPrefix } from "./uploads";

export interface Outside {
  /** Ключі файлів у R2: фото профілю й робіт, фото розмов, файли запитів (і завантажені, але не додані до запиту), які прибираємо. */
  keys: string[];
  /** Пости запитів у каналі. */
  posts: { chatId: string; messageId: number }[];
}

const listPrefix = async (prefix: string): Promise<string[]> => {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await getBucket().list({ prefix, cursor });
    keys.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
};

/** Збирає, що прибрати поза базою. Викликати до видалення рядків. */
export const collectOutside = async (input: { userId: string; conversationIds: string[] }): Promise<Outside> => {
  const db = getDb();
  const [photos, attachments, files, posts] = await Promise.all([
    listPrefix(photoKeyPrefix(input.userId)),
    inChunks(input.conversationIds, (chunk) => db.select({ key: chatAttachments.key }).from(chatAttachments).where(inArray(chatAttachments.conversationId, chunk))),
    db
      .select({ key: requestFiles.key })
      .from(requestFiles)
      .leftJoin(requests, eq(requests.id, requestFiles.requestId))
      .where(and(isNotNull(requestFiles.key), or(eq(requestFiles.uploaderUserId, input.userId), eq(requests.userId, input.userId)))),
    db
      .select({ chatId: channelPosts.chatId, messageId: channelPosts.messageId })
      .from(channelPosts)
      .innerJoin(requests, eq(requests.id, channelPosts.requestId))
      .where(and(eq(requests.userId, input.userId), isNotNull(channelPosts.messageId))),
  ]);
  return { keys: [...photos, ...attachments.map((item) => item.key), ...files.flatMap((item) => (item.key ? [item.key] : []))], posts: posts.flatMap((post) => (post.messageId === null ? [] : [{ chatId: post.chatId, messageId: post.messageId }])) };
};

const forgetInTelemetry = async (userId: string): Promise<void> => {
  const db = telemetryConfig.db();
  if (!db) return;
  await db.batch([db.prepare("UPDATE events SET user_id = NULL WHERE user_id = ?").bind(userId), db.prepare("UPDATE logs SET user_id = NULL WHERE user_id = ?").bind(userId)]);
};

const failed = (step: string, error: unknown) => logServer({ level: "warn", event: "account_cleanup_failed", message: error instanceof Error ? error.message : String(error), detail: { step } });

/** Прибирає зібране після видалення акаунта. Кожен крок окремо: збій одного не зупиняє решту. */
export const cleanOutside = async (userId: string, outside: Outside): Promise<void> => {
  try {
    for (let start = 0; start < outside.keys.length; start += 1000) await getBucket().delete(outside.keys.slice(start, start + 1000));
  } catch (error) {
    failed("r2", error);
  }
  if (telegramConfig().enabled) {
    for (const post of outside.posts) {
      try {
        await deleteMessage(post.chatId, post.messageId);
      } catch (error) {
        failed("channel_post", error);
      }
    }
  }
  try {
    await forgetInTelemetry(userId);
  } catch (error) {
    failed("telemetry", error);
  }
};
