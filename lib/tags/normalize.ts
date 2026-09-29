// lib/tags/normalize.ts
//
// Один спосіб звести текст до порівнюваного вигляду: і словник, і запит
// проходять через ту саму функцію, тож «Telegram-бот», «telegram бот» і
// «TELEGRAM  бот» стають однаковими.

const APOSTROPHES = /[’ʼ`´‘]/g;
/** Лишаємо літери, цифри, апостроф і знаки, що є частиною назв: c#, c++, next.js. */
const NOISE = /[^\p{L}\p{N}'+#.]+/gu;

export const normalizeTagText = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(APOSTROPHES, "'")
    .replace(NOISE, " ")
    // Крапка лишається лише всередині слова (next.js), а не в кінці речення.
    .replace(/\.(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
