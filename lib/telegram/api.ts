// lib/telegram/api.ts
//
// Клієнт Bot API на голому `fetch`: шість методів, нуль залежностей, працює у
// воркері. Бібліотеку (grammY) варто брати, якщо в боті з'являться діалоги.
//
// ВАЖЛИВО: адреса запиту містить токен (`/bot<токен>/метод`). Вона ніколи не
// потрапляє ні в помилки, ні в журнал: усе, що кидаємо, збираємо з нашого
// тексту й відповіді Telegram.

import { telegramConfig } from "./config";
import type { InlineKeyboard } from "./types";

const API = "https://api.telegram.org";
const TIMEOUT_MS = 10_000;

export class TelegramError extends Error {
  readonly method: string;
  /** Код Bot API (400, 403, 429…); 0 — мережа чи тайм-аут. */
  readonly code: number;
  /** Скільки секунд Telegram просить зачекати (429). */
  readonly retryAfter?: number;

  constructor(method: string, code: number, description: string, retryAfter?: number) {
    super(`Telegram ${method}: ${code} ${description}`);
    this.name = "TelegramError";
    this.method = method;
    this.code = code;
    this.retryAfter = retryAfter;
  }

  /** Людина заблокувала бота чи видалила чат: писати їй більше не можна. */
  get blocked(): boolean {
    return this.code === 403;
  }
}

export interface CallOptions {
  /** Інший токен (скрипт налаштування читає його зі змінної оболонки). */
  token?: string;
  /** Для тестів. */
  fetchImpl?: typeof fetch;
}

export const callTelegram = async <T>(method: string, params: Record<string, unknown> = {}, options: CallOptions = {}): Promise<T> => {
  const token = options.token ?? telegramConfig().token;
  if (!token) throw new TelegramError(method, 0, "бот вимкнений: немає токена");
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Текст помилки мережі може містити адресу з токеном: беремо лише назву.
    throw new TelegramError(method, 0, error instanceof Error ? error.name : "network");
  }
  const data = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } } | null;
  if (!data?.ok) throw new TelegramError(method, data?.error_code ?? response.status, data?.description ?? "без відповіді", data?.parameters?.retry_after);
  return data.result as T;
};

export interface SendOptions extends CallOptions {
  keyboard?: InlineKeyboard;
  /** Без звуку: для нічних годин. */
  silent?: boolean;
  /** Не розгортати попередній перегляд посилання. */
  noPreview?: boolean;
}

/** Повідомлення в HTML-режимі: усі тексти проходять `escapeHtml` (lib/telegram/texts.ts). */
export const sendMessage = (chatId: string | number, text: string, options: SendOptions = {}) =>
  callTelegram<{ message_id: number }>(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(options.keyboard ? { reply_markup: options.keyboard } : {}),
      ...(options.silent ? { disable_notification: true } : {}),
      ...(options.noPreview !== false ? { link_preview_options: { is_disabled: true } } : {}),
    },
    options
  );

export const editMessageText = (chatId: string | number, messageId: number, text: string, options: SendOptions = {}) =>
  callTelegram("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: options.keyboard ?? { inline_keyboard: [] } }, options);

export const deleteMessage = (chatId: string | number, messageId: number, options: CallOptions = {}) => callTelegram("deleteMessage", { chat_id: chatId, message_id: messageId }, options);

export const answerCallbackQuery = (id: string, text?: string, options: CallOptions = {}) => callTelegram("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) }, options);
