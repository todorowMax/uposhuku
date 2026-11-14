// lib/telegram/handle-update.ts
//
// Маршрутизація оновлень Telegram. Бот приватний: у групах мовчить.
// Усе, що може піти не так, не кидає: вебхук має відповісти 200, інакше
// Telegram повторюватиме оновлення.

import { cancelRelink, confirmRelink, consumeLinkToken, deactivateByChat, linkByChat, type TelegramChatInfo } from "@/lib/server/telegram-repo";
import { EVENTS } from "@/lib/telemetry/events";
import { logServer, serverEvent } from "@/lib/telemetry/log";
import { pushUser } from "@/lib/server/realtime";
import { normalizePhone } from "@/lib/phone/format";
import { bindPhone } from "@/lib/server/phone-repo";
import { answerCallbackQuery, editMessageText, sendMessage, TelegramError } from "./api";
import { telegramConfig } from "./config";
import { TEXTS, escapeHtml } from "./texts";
import type { InlineKeyboard, ReplyKeyboard, ReplyMarkup, TgCallbackQuery, TgChatMemberUpdated, TgMessage, TgUpdate } from "./types";

const siteKeyboard = (siteUrl: string, label: string = TEXTS.openSite, path = ""): InlineKeyboard => ({ inline_keyboard: [[{ text: label, url: `${siteUrl}${path}` }]] });

/** Команда й параметр: `/start abc`, `/start@vibemap_bot abc`. */
export const parseCommand = (text: string): { command: string; arg: string } | null => {
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+(\S+))?/i.exec(text.trim());
  return match ? { command: match[1].toLowerCase(), arg: match[2] ?? "" } : null;
};

const reply = async (chatId: number | string, text: string, keyboard?: ReplyMarkup) => {
  try {
    await sendMessage(chatId, text, { keyboard });
  } catch (error) {
    // Людина заблокувала бота між повідомленнями: не помилка нашого коду.
    if (error instanceof TelegramError && error.blocked) await deactivateByChat(String(chatId), true);
    else logServer({ level: "warn", event: "telegram_reply_failed", message: error instanceof Error ? error.message : String(error) });
  }
};

const RELINK_YES = "relink_yes:";
const RELINK_NO = "relink_no:";

const linkedKeyboard = (siteUrl: string): InlineKeyboard => ({
  inline_keyboard: [[{ text: TEXTS.openSettings, url: `${siteUrl}/?open=settings` }, { text: TEXTS.openSite, url: siteUrl }]],
});

/** Кнопка «Поділитися номером»: одноразова, лише в приватному чаті. Сам контакт приходить окремим повідомленням. */
export const contactKeyboard = (): ReplyKeyboard => ({ keyboard: [[{ text: TEXTS.phoneButton, request_contact: true }]], one_time_keyboard: true, resize_keyboard: true });

/** Чат прив'язано: відповідь людині, оновлення сторінки на сайті, подія в журнал. */
const announceLinked = async (result: { userId: string; replacedOtherAccount: boolean; purpose: "phone" | null }, chatId: string, say: (text: string, keyboard: InlineKeyboard) => Promise<unknown>) => {
  const config = telegramConfig();
  await say(result.replacedOtherAccount ? `${TEXTS.linked}\n\n${TEXTS.linkedReplaced}` : TEXTS.linked, linkedKeyboard(config.siteUrl));
  // Сайт оновить стан «Підключити» без перезавантаження.
  pushUser(result.userId, { t: "telegram" });
  serverEvent(EVENTS.telegramLinked, { replaced: result.replacedOtherAccount }, result.userId, "/api/telegram/webhook");
  // Прив'язка почалась з підтвердження телефону: одразу просимо контакт.
  if (result.purpose === "phone") await reply(chatId, TEXTS.phoneAsk, contactKeyboard());
};

const onStart = async (message: TgMessage, arg: string) => {
  const config = telegramConfig();
  const chatId = String(message.chat.id);
  if (!arg) {
    await reply(chatId, TEXTS.welcome, siteKeyboard(config.siteUrl));
    return;
  }
  const result = await consumeLinkToken(arg, { chatId, username: message.from?.username ?? null, firstName: message.from?.first_name ?? null });
  if (!result.ok && result.confirmId) {
    // Чат уже чий-небудь: чужу прив'язку без згоди власника не знімаємо (за посиланням від чужої людини так відключали б жертву).
    await reply(chatId, TEXTS.relinkAsk, {
      inline_keyboard: [[{ text: TEXTS.relinkYes, callback_data: `${RELINK_YES}${result.confirmId}` }, { text: TEXTS.relinkNo, callback_data: `${RELINK_NO}${result.confirmId}` }]],
    });
    return;
  }
  if (!result.ok) {
    await reply(chatId, TEXTS.tokenExpired, siteKeyboard(config.siteUrl));
    return;
  }
  await announceLinked(result, chatId, (text, keyboard) => reply(chatId, text, keyboard));
};

/** Кнопки підтвердження перепривʼязки. Натиснути їх може лише той, кому бот показав кнопки: у його приватному чаті. */
const onCallback = async (query: TgCallbackQuery) => {
  const message = query.message;
  const data = query.data ?? "";
  const confirm = data.startsWith(RELINK_YES);
  if (!message || message.chat.type !== "private" || (!confirm && !data.startsWith(RELINK_NO))) {
    await answerCallbackQuery(query.id).catch(() => {});
    return;
  }
  const chatId = String(message.chat.id);
  const confirmId = data.slice((confirm ? RELINK_YES : RELINK_NO).length);
  const chat: TelegramChatInfo = { chatId, username: query.from.username ?? null, firstName: query.from.first_name ?? null };
  const finish = async (text: string, keyboard?: InlineKeyboard) => {
    await answerCallbackQuery(query.id).catch(() => {});
    // Кнопки з повідомлення прибираємо: друге натискання нічого не дасть, а текст каже, чим усе скінчилось.
    await editMessageText(chatId, message.message_id, text, { keyboard }).catch(() => reply(chatId, text, keyboard));
  };
  if (!confirm) {
    await cancelRelink(confirmId);
    await finish(TEXTS.relinkKept);
    return;
  }
  const result = await confirmRelink(confirmId, chat);
  if (!result.ok) {
    await finish(TEXTS.tokenExpired, siteKeyboard(telegramConfig().siteUrl));
    return;
  }
  await announceLinked(result, chatId, (text, keyboard) => finish(text, keyboard));
};

const BIND_TEXT = { taken: TEXTS.phoneTaken, blocked: TEXTS.phoneBlocked, locked: TEXTS.phoneLocked, unavailable: TEXTS.phoneFailed } as const;

/**
 * Контакт з кнопки «Поділитися номером». Приймаємо лише з прив'язаного чату й лише свій: `contact.user_id` має збігатися з
 * `from.id` (чужий контакт можна переслати чи вибрати вручну). Номер у журнал не пишемо.
 */
const onContact = async (message: TgMessage, contact: NonNullable<TgMessage["contact"]>) => {
  const chatId = String(message.chat.id);
  const link = await linkByChat(chatId);
  if (!link) {
    await reply(chatId, TEXTS.notLinked, siteKeyboard(telegramConfig().siteUrl));
    return;
  }
  const phone = typeof contact.user_id === "number" && contact.user_id === message.from?.id ? normalizePhone(contact.phone_number) : null;
  if (!phone) {
    await reply(chatId, TEXTS.phoneNotOwn, contactKeyboard());
    return;
  }
  const result = await bindPhone(link.userId, phone);
  if (result !== "ok") {
    await reply(chatId, BIND_TEXT[result], { remove_keyboard: true });
    return;
  }
  await reply(chatId, TEXTS.phoneDone, { remove_keyboard: true });
  // Сайт оновить шторку й меню без перезавантаження.
  pushUser(link.userId, { t: "phone" });
};

const onMessage = async (message: TgMessage) => {
  // Бот для особистих сповіщень: у групах, супергрупах і каналах не відповідаємо.
  if (message.chat.type !== "private") return;
  if (message.contact) return onContact(message, message.contact);
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

/**
 * Обробляє одне оновлення. `true`: оброблено, його можна позначати баченим. `false`: збій (база, код), оновлення
 * треба повторити, тож вебхук не позначає його, а Telegram пришле ще раз. Помилки відправки відповіді сюди не
 * входять: недоставлена відповідь не причина повторювати дію.
 */
export const handleUpdate = async (update: TgUpdate): Promise<boolean> => {
  try {
    if (update.message) await onMessage(update.message);
    else if (update.my_chat_member) await onMemberUpdate(update.my_chat_member);
    else if (update.callback_query) await onCallback(update.callback_query);
    return true;
  } catch (error) {
    logServer({ level: "error", event: "telegram_update_failed", message: error instanceof Error ? error.message : String(error), detail: { updateId: update.update_id, stack: error instanceof Error ? error.stack : null } });
    return false;
  }
};
