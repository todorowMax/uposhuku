// lib/telegram/notices.ts
//
// Тексти сповіщень у Telegram. Чисті функції: дані → { ключ, текст, кнопка }.
// Ключ не дає повторити те саме й тримає частоту (див. lib/server/notify.ts).
// Усе від людей проходить escapeHtml; контакти з тексту запиту вирізаємо.

import type { NotificationKind } from "@/lib/notification-prefs";
import { stripContacts } from "@/lib/chat/contacts";
import { escapeHtml, excerpt } from "./texts";

export interface Notice {
  kind: NotificationKind;
  /** Унікальний ключ випадку: вікно часу чи стан угоди всередині. */
  key: string;
  /** Текст у HTML-режимі Telegram. */
  html: string;
  /** Кнопка під повідомленням: шлях на сайті, що відкриває потрібну панель. */
  button?: { text: string; path: string };
}

/** Не частіше разу на 10 хвилин на розмову чи запит: серія повідомлень не має ставати лавиною. */
export const WINDOW_MS = 10 * 60 * 1000;
export const bucket = (now: number, windowMs = WINDOW_MS) => Math.floor(now / windowMs);

/** Шлях із позначками джерела, щоб аналітика бачила, звідки прийшли. */
export const deepLink = (open: string, medium: "bot" | "channel" = "bot") => `/?open=${encodeURIComponent(open)}&utm_source=telegram&utm_medium=${medium}`;

const money = (value: number) => new Intl.NumberFormat("uk-UA").format(value).replace(/ /g, " ");

export const offerNotice = (input: { requestId: string; requestText: string; price: number | null; days: number; now?: number }): Notice => ({
  kind: "offers",
  key: `offer:${input.requestId}:${bucket(input.now ?? Date.now())}`,
  html: `Нова пропозиція на ваш запит «${escapeHtml(excerpt(stripContacts(input.requestText), 60))}»: ${input.price === null ? "ціну обговоримо" : `${money(input.price)} ₴`}, ${input.days} дн.`,
  button: { text: "Переглянути", path: deepLink(`offers:${input.requestId}`) },
});

export const messageNotice = (input: { conversationId: string; fromName: string; text: string; now?: number }): Notice => ({
  kind: "messages",
  key: `msg:${input.conversationId}:${bucket(input.now ?? Date.now())}`,
  html: `<b>${escapeHtml(excerpt(input.fromName, 40))}</b>: ${escapeHtml(excerpt(input.text, 100))}`,
  button: { text: "Відповісти", path: deepLink(`chat:${input.conversationId}`) },
});

/** Що сталося з угодою: дія → текст для іншої сторони. */
export const DEAL_TEXTS: Record<string, string> = {
  proposed: "Вам запропонували угоду.",
  accept: "Виконавець прийняв угоду.",
  decline: "Виконавець відхилив угоду.",
  confirm_paid: "Виконавець підтвердив оплату.",
  deliver: "Виконавець здав етап: перевірте й прийміть роботу.",
  fund: "Замовник оплатив угоду.",
  claim_paid: "Замовник каже, що оплатив: підтвердіть, коли гроші прийдуть.",
  release: "Замовник прийняв роботу.",
  dispute: "Замовник відкрив спір.",
  cancel: "Замовник скасував пропозицію угоди.",
  withdraw: "Виконавець відкликав свою пропозицію угоди.",
  moderator_release: "Модератор розглянув спір: етап виплачується виконавцю.",
  moderator_refund: "Модератор розглянув спір: кошти повертаються замовнику.",
  moderator_rework: "Модератор розглянув спір: етап повернуто виконавцю на доопрацювання.",
  owner_accept: "Замовник прийняв ваші умови угоди.",
  owner_decline: "Замовник відхилив ваші умови угоди.",
};

export const dealNotice = (input: { dealId: string; action: string; conversationId?: string }): Notice | null => {
  const text = DEAL_TEXTS[input.action];
  if (!text) return null;
  return {
    kind: "deals",
    key: `deal:${input.dealId}:${input.action}`,
    html: `Угода: ${escapeHtml(text)}`,
    // Розмова за угодою невідома з роуту дій: ведемо у список повідомлень, де угода стоїть угорі.
    button: { text: "Відкрити", path: deepLink(input.conversationId ? `chat:${input.conversationId}` : "inbox") },
  };
};

export const matchNotice = (input: { requestId: string; userId: string; text: string; budget?: string | null; place: string }): Notice => ({
  kind: "matching",
  key: `match:${input.requestId}:${input.userId}`,
  html: `Новий запит під ваші теги: «${escapeHtml(excerpt(stripContacts(input.text), 60))}».${input.budget ? ` ${escapeHtml(input.budget)} ·` : ""} ${escapeHtml(input.place)}`,
  button: { text: "Подивитися", path: deepLink(`request:${input.requestId}`) },
});
