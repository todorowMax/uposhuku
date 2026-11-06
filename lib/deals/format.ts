// lib/deals/format.ts
//
// Подання сум і термінів угоди для людей. Одна реалізація на весь інтерфейс угод.

const PRICE = new Intl.NumberFormat("uk-UA");

/** Між сумою й валютою нерозривний пробіл: «10 000 ₴» не переноситься на два рядки. */
export const money = (value: number): string => `${PRICE.format(value)}\u00A0₴`;

/** Сума угоди у валюті угоди: гривні (за замовчуванням) або USDT для ескроу. */
export const moneyIn = (value: number, currency: "UAH" | "USDT" = "UAH"): string => (currency === "USDT" ? `${PRICE.format(value)}\u00A0USDT` : money(value));

/** «день / дні / днів» за числом. */
export const daysWord = (days: number): string => {
  const tens = days % 100;
  const ones = days % 10;
  if (ones === 1 && tens !== 11) return "день";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "дні";
  return "днів";
};
