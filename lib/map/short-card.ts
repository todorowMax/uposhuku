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

/** Менше місяця — «Новий на Findlyfy», далі «На Findlyfy 8 міс.». */
export const platformLabel = (months: number) => (months < 1 ? "Новий на Findlyfy" : `На Findlyfy ${months} міс.`);

export const ratingLabel = (rating: number) => RATING.format(rating);

export interface ShortFacts {
  /** «★ 4,8 · 12 відгуків» або «Ще без відгуків». */
  reviewsLine: string;
  /** «3 перевірених»; null, коли таких відгуків немає. */
  verifiedLine: string | null;
  dealsLine: string;
  platformLine: string;
}

const hasReviews = (stats: PerformerStats | undefined): stats is PerformerStats & { rating: number } =>
  stats !== undefined && stats.rating !== null && stats.reviews > 0;

export const shortFacts = (stats: PerformerStats | undefined): ShortFacts => {
  const verified = stats?.verifiedReviews ?? 0;
  return {
    reviewsLine: hasReviews(stats) ? `★ ${ratingLabel(stats.rating)} · ${pluralUk(stats.reviews, REVIEWS)}` : "Ще без відгуків",
    verifiedLine: verified > 0 ? `${verified} перевірених` : null,
    dealsLine: dealsLabel(stats?.orders ?? 0),
    platformLine: platformLabel(stats?.months ?? 0),
  };
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
