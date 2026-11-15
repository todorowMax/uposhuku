// lib/telegram/notices.ts
//
// Тексти сповіщень у Telegram. Чисті функції: дані → { ключ, текст, кнопка }.
// Ключ не дає повторити те саме й тримає частоту (див. lib/server/notify.ts).
// Усе від людей проходить escapeHtml; контакти з тексту запиту вирізаємо.

import type { NotificationKind } from "@/lib/notification-prefs";
import { stripContacts } from "@/lib/chat/contacts";
import { escapeHtml, excerpt } from "./texts";

/**
 * Що сталося, без тексту й особистого: з цього будується лист (lib/server/mail.ts). Лише факт, ім'я співрозмовника
 * з профілю чи назва власного запиту (до 60 знаків), і куди відкрити на сайті (`open`, як у `?open=`).
 */
export type EmailEvent =
  | { type: "message"; fromName: string; open: string }
  | { type: "offer"; title: string; open: string }
  | { type: "deal"; action: string; open: string; stageTitle?: string };

export interface Notice {
  kind: NotificationKind;
  /** Унікальний ключ випадку: вікно часу чи стан угоди всередині. */
  key: string;
  /** Текст у HTML-режимі Telegram. */
  html: string;
  /** Кнопка під повідомленням: шлях на сайті, що відкриває потрібну панель. */
  button?: { text: string; path: string };
  /** Лист на пошту, якщо цей випадок його вартий; без поля листа немає. */
  email?: EmailEvent;
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
  email: { type: "offer", title: excerpt(stripContacts(input.requestText), 60), open: `offers:${input.requestId}` },
});

export const messageNotice = (input: { conversationId: string; toUserId: string; fromName: string; text: string; now?: number }): Notice => ({
  kind: "messages",
  key: `msg:${input.conversationId}:${input.toUserId}:${bucket(input.now ?? Date.now())}`,
  html: `<b>${escapeHtml(excerpt(input.fromName, 40))}</b>: ${escapeHtml(excerpt(input.text, 100))}`,
  button: { text: "Відповісти", path: deepLink(`chat:${input.conversationId}`) },
  // У листі тексту повідомлення немає, лише ім'я.
  email: { type: "message", fromName: excerpt(input.fromName, 40), open: `chat:${input.conversationId}` },
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
  moderator_partial: "Модератор розглянув спір: виконавцю виплачується частина, решта виконавцю не виплачується.",
  moderator_rework: "Модератор розглянув спір: етап повернуто виконавцю на доопрацювання.",
  paid: "Замовник оплатив етап: кошти заморожено в банку, можна працювати.",
  payout_done: "Етап виплачено виконавцю: банк підтвердив.",
  refund_done: "Кошти за етап повернено замовнику: банк підтвердив.",
  hold_ending: "Холд за етап добігає кінця. Якщо роботу не прийнято й спір не вирішено, банк поверне кошти замовнику.",
  auto_accepted: "Замовник не відповів у строк, роботу прийнято автоматично: етап виплачується виконавцю.",
  hold_expiry_refund: "Етап не здано до кінця холду: кошти повертаються замовнику.",
  escrow_funded: "Замовник вніс кошти в ескроу: можна працювати.",
  escrow_delivered: "Виконавець здав етап в ескроу: перевірте й прийміть роботу в гаманці.",
  escrow_disputed: "За етапом ескроу відкрито спір: рішення ухвалить арбітр.",
  escrow_released: "Етап ескроу виплачено виконавцю.",
  escrow_refunded: "Кошти за етап ескроу повернено замовнику.",
  escrow_review_ended: "Строк перевірки етапу ескроу минув: натисніть «Забрати кошти».",
  escrow_delivery_late: "Виконавець не здав етап ескроу вчасно: натисніть «Повернути кошти».",
  owner_accept: "Замовник прийняв ваші умови угоди.",
  owner_decline: "Замовник відхилив ваші умови угоди.",
};

/** Про що з угоди пишемо ще й листом: умови запропоновано чи прийнято, роботу прийнято, просять підтвердити оплату. Решта лишається в Telegram і на сайті. */
export const EMAIL_DEAL_ACTIONS: ReadonlySet<string> = new Set(["proposed", "owner_accept", "accept", "release", "auto_accepted", "claim_paid"]);

/** Нагадування по завислій оплаті етапу прямої угоди: замовнику й виконавцю різні слова. */
export type PayReminderRole = "customer" | "performer";

const payReminderAction = (role: PayReminderRole) => `pay_remind_${role}`;

/** Текст нагадування за дією з листа чи ключа; undefined, якщо дія не з нагадувань. */
export const payReminderLead = (action: string, stageTitle: string | undefined): string | undefined => {
  const title = stageTitle ? ` «${stageTitle}»` : "";
  if (action === payReminderAction("customer")) return `Ви оплатили етап${title}? Позначте «Я оплатив(ла)» в угоді.`;
  if (action === payReminderAction("performer")) return `Оплата за етап${title} надійшла? Позначте «Оплату отримано».`;
  return undefined;
};

export const payReminderNotice = (input: { dealId: string; stageId: string; stageTitle: string; number: number; role: PayReminderRole; conversationId?: string }): Notice => {
  const open = input.conversationId ? `chat:${input.conversationId}` : "inbox";
  const action = payReminderAction(input.role);
  const title = excerpt(input.stageTitle, 60);
  return {
    kind: "deals",
    key: `deal:${input.dealId}:${action}:${input.stageId}:${input.number}`,
    html: `Угода: ${escapeHtml(payReminderLead(action, title) ?? "")}`,
    button: { text: "Відкрити", path: deepLink(open) },
    email: { type: "deal", action, open, stageTitle: title },
  };
};

export const dealNotice = (input: { dealId: string; action: string; conversationId?: string }): Notice | null => {
  const text = DEAL_TEXTS[input.action];
  if (!text) return null;
  // Розмова за угодою невідома з роуту дій: ведемо у список повідомлень, де угода стоїть угорі.
  const open = input.conversationId ? `chat:${input.conversationId}` : "inbox";
  return {
    kind: "deals",
    key: `deal:${input.dealId}:${input.action}`,
    html: `Угода: ${escapeHtml(text)}`,
    button: { text: "Відкрити", path: deepLink(open) },
    ...(EMAIL_DEAL_ACTIONS.has(input.action) ? { email: { type: "deal" as const, action: input.action, open } } : {}),
  };
};

export const matchNotice = (input: { requestId: string; userId: string; text: string; budget?: string | null; place: string }): Notice => ({
  kind: "matching",
  key: `match:${input.requestId}:${input.userId}`,
  html: `Новий запит під ваші теги: «${escapeHtml(excerpt(stripContacts(input.text), 60))}».${input.budget ? ` ${escapeHtml(input.budget)} ·` : ""} ${escapeHtml(input.place)}`,
  button: { text: "Подивитися", path: deepLink(`request:${input.requestId}`) },
});
