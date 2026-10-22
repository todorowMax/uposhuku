// lib/telegram/handle-update.ts
//
// Маршрутизація оновлень Telegram. Бот приватний: у групах мовчить.
// Усе, що може піти не так, не кидає: вебхук має відповісти 200, інакше
// Telegram повторюватиме оновлення.

import { consumeLinkToken, deactivateByChat, linkByChat } from "@/lib/server/telegram-repo";
import { EVENTS } from "@/lib/telemetry/events";
import { logServer, serverEvent } from "@/lib/telemetry/log";
import { pushUser } from "@/lib/server/realtime";
import { answerCallbackQuery, sendMessage, TelegramError } from "./api";
import { telegramConfig } from "./config";
import { TEXTS, escapeHtml } from "./texts";
import type { InlineKeyboard, TgChatMemberUpdated, TgMessage, TgUpdate } from "./types";

const siteKeyboard = (siteUrl: string, label: string = TEXTS.openSite, path = ""): InlineKeyboard => ({ inline_keyboard: [[{ text: label, url: `${siteUrl}${path}` }]] });

/** Команда й параметр: `/start abc`, `/start@vibemap_bot abc`. */
export const parseCommand = (text: string): { command: string; arg: string } | null => {
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+(\S+))?/i.exec(text.trim());
  return match ? { command: match[1].toLowerCase(), arg: match[2] ?? "" } : null;
};

const reply = async (chatId: number | string, text: string, keyboard?: InlineKeyboard) => {
  try {
    await sendMessage(chatId, text, { keyboard });
  } catch (error) {
    // Людина заблокувала бота між повідомленнями: не помилка нашого коду.
    if (error instanceof TelegramError && error.blocked) await deactivateByChat(String(chatId), true);
    else logServer({ level: "warn", event: "telegram_reply_failed", message: error instanceof Error ? error.message : String(error) });
  }
};

const onStart = async (message: TgMessage, arg: string) => {
  const config = telegramConfig();
  const chatId = String(message.chat.id);
  if (!arg) {
    await reply(chatId, TEXTS.welcome, siteKeyboard(config.siteUrl));
    return;
  }
  const result = await consumeLinkToken(arg, { chatId, username: message.from?.username ?? null, firstName: message.from?.first_name ?? null });
  if (!result.ok) {
    await reply(chatId, TEXTS.tokenExpired, siteKeyboard(config.siteUrl));
    return;
  }
  await reply(chatId, result.replacedOtherAccount ? `${TEXTS.linked}\n\n${TEXTS.linkedReplaced}` : TEXTS.linked, {
    inline_keyboard: [[{ text: TEXTS.openSettings, url: `${config.siteUrl}/?open=settings` }, { text: TEXTS.openSite, url: config.siteUrl }]],
  });
  // Сайт оновить стан «Підключити» без перезавантаження.
  pushUser(result.userId, { t: "telegram" });
  serverEvent(EVENTS.telegramLinked, { replaced: result.replacedOtherAccount }, result.userId, "/api/telegram/webhook");
};

const onMessage = async (message: TgMessage) => {
  // Бот для особистих сповіщень: у групах, супергрупах і каналах не відповідаємо.
  if (message.chat.type !== "private") return;
  const chatId = String(message.chat.id);
  const config = telegramConfig();
  const parsed = message.text ? parseCommand(message.text) : null;
  if (!parsed) {
    await reply(chatId, TEXTS.unknown);
    return;
  }
  switch (parsed.command) {
    case "start":
      return onStart(message, parsed.arg);
    case "help":
      return reply(chatId, TEXTS.help, siteKeyboard(config.siteUrl));
    case "settings":
      return reply(chatId, (await linkByChat(chatId)) ? TEXTS.settings : TEXTS.notLinked, siteKeyboard(config.siteUrl, TEXTS.openSettings, "/?open=settings"));
    case "stop": {
      const userId = await deactivateByChat(chatId);
      if (userId) serverEvent(EVENTS.telegramUnlinked, { by: "bot" }, userId, "/api/telegram/webhook");
      return reply(chatId, userId ? TEXTS.stopped : TEXTS.notLinked, siteKeyboard(config.siteUrl));
    }
    default:
      return reply(chatId, TEXTS.unknown);
  }
};

const onMemberUpdate = async (update: TgChatMemberUpdated) => {
  const status = update.new_chat_member.status;
  if (update.chat.type === "private") {
    // Людина заблокувала бота: писати їй більше не можна.
    if (status === "kicked") {
      const userId = await deactivateByChat(String(update.chat.id), true);
      if (userId) serverEvent(EVENTS.telegramUnlinked, { by: "blocked" }, userId, "/api/telegram/webhook");
    }
    return;
  }
  // Бота додали (або зняли) в каналі: так Макс дізнається id каналу для TELEGRAM_CHANNEL_ID.
  if (update.chat.type === "channel" || update.chat.type === "supergroup" || update.chat.type === "group") {
    logServer({
      level: "info",
      event: "telegram_chat_member",
      message: `${update.chat.type} ${escapeHtml(update.chat.title ?? "")}: ${status}`,
      detail: { chatId: update.chat.id, type: update.chat.type, title: update.chat.title ?? null, status },
    });
  }
};

/** Обробляє одне оновлення. Не кидає. */
export const handleUpdate = async (update: TgUpdate): Promise<void> => {
  try {
    if (update.message) await onMessage(update.message);
    else if (update.my_chat_member) await onMemberUpdate(update.my_chat_member);
    else if (update.callback_query) await answerCallbackQuery(update.callback_query.id).catch(() => {});
  } catch (error) {
    logServer({ level: "error", event: "telegram_update_failed", message: error instanceof Error ? error.message : String(error), detail: { updateId: update.update_id, stack: error instanceof Error ? error.stack : null } });
  }
};
