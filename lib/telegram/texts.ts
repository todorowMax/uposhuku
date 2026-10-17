// lib/telegram/texts.ts
//
// Усі тексти бота й каналу. Українською, у HTML-режимі Telegram, тож усе, що
// прийшло від людей (назви, тексти запитів), проходить `escapeHtml`.

export const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Обрізає по межі слова з «…»: цитата із запиту чи повідомлення. */
export const excerpt = (value: string, max: number): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
};

export const TEXTS = {
  welcome: "Привіт! Я надсилаю сповіщення з Findlyfy: нові пропозиції, повідомлення, угоди й запити під ваші теги.\n\nЩоб підключити акаунт, відкрийте на сайті «Сповіщення» → «Telegram» → «Підключити».",
  help: "Я надсилаю сповіщення з Findlyfy.\n\n/settings: налаштування сповіщень\n/stop: вимкнути сповіщення\n\nПідключити акаунт можна на сайті: «Сповіщення» → «Telegram».",
  linked: "Готово: акаунт підключено. Сюди прийдуть нові пропозиції, повідомлення, угоди й запити під ваші теги. Налаштувати, про що писати, можна на сайті.",
  linkedReplaced: "Попередній акаунт від цього Telegram відключено.",
  tokenExpired: "Посилання застаріло або вже використане. Натисніть «Підключити» на сайті ще раз.",
  stopped: "Сповіщення вимкнено. Підключити знову можна на сайті: «Сповіщення» → «Telegram».",
  notLinked: "Цей Telegram ще не підключено до акаунта. Зробіть це на сайті: «Сповіщення» → «Telegram».",
  settings: "Налаштувати, про що вам писати, можна на сайті:",
  unknown: "Я не розумію такого. Скористайтеся командами: /help, /settings, /stop.",
  openSite: "Відкрити Findlyfy",
  openSettings: "Налаштування",
} as const;
