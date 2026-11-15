// lib/map/short-card.ts
//
// Підписи короткої картки виконавця: рейтинг, угоди, час на платформі. Чиста логіка без доступу до вікна:
// цифри дає PerformerStats із сервера, тут лише слова й множина.

import type { PerformerStats } from "./types";

const RULES = new Intl.PluralRules("uk");
const RATING = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Forms = readonly [one: string, few: string, many: string];

/** «1 угода», «3 угоди», «7 угод»: форму добирає Intl.PluralRules. */
export const pluralUk = (count: number, forms: Forms) => {
  const category = RULES.select(count);
  const form = category === "one" ? forms[0] : category === "few" ? forms[1] : forms[2];
  return `${count} ${form}`;
};

const DEALS: Forms = ["угода", "угоди", "угод"];
const REVIEWS: Forms = ["відгук", "відгуки", "відгуків"];

export const dealsLabel = (orders: number) => pluralUk(orders, DEALS);

export const ratingLabel = (rating: number) => RATING.format(rating);

const hasReviews = (stats: PerformerStats | undefined): stats is PerformerStats & { rating: number } =>
  stats !== undefined && stats.rating !== null && stats.reviews > 0;

/** Лише слово у потрібній формі: «угода», «угоди», «угод». */
export const pluralWordUk = (count: number, forms: Forms) => pluralUk(count, forms).slice(String(count).length + 1);

export interface ShortStat {
  /** Велике значення зверху: «★ 4,7», «12», «8 міс.». */
  value: string;
  /** Підпис під ним: «3 відгуки», «угод», «на Findlyfy». */
  label: string;
}

/**
 * Три цифри короткої картки рядком, як у профілі: рейтинг, угоди, час на платформі.
 * Без відгуків рейтинг «—» з підписом «без відгуків»; менше місяця — «новий».
 */
export const shortStats = (stats: PerformerStats | undefined): [ShortStat, ShortStat, ShortStat] => {
  const orders = stats?.orders ?? 0;
  const months = stats?.months ?? 0;
  return [
    hasReviews(stats) ? { value: `★ ${ratingLabel(stats.rating)}`, label: pluralUk(stats.reviews, REVIEWS) } : { value: "—", label: "без відгуків" },
    { value: String(orders), label: pluralWordUk(orders, DEALS) },
    months < 1 ? { value: "новий", label: "на Findlyfy" } : { value: `${months} міс.`, label: "на Findlyfy" },
  ];
};

const PERFORMERS: Forms = ["виконавець", "виконавці", "виконавців"];
const REQUESTS: Forms = ["запит", "запити", "запитів"];

/** Заголовок групи: «4 виконавці · 1 запит». */
export const groupTitle = (performers: number, requests: number) =>
  [performers ? pluralUk(performers, PERFORMERS) : null, requests ? pluralUk(requests, REQUESTS) : null].filter(Boolean).join(" · ");

/** Рядок у списку групи:«★ 4,8 · 7 угод» або «Ще без відгуків · 7 угод». */
export const rowLine = (stats: PerformerStats | undefined) => {
  const head = hasReviews(stats) ? `★ ${ratingLabel(stats.rating)}` : "Ще без відгуків";
  return `${head} · ${dealsLabel(stats?.orders ?? 0)}`;
};
