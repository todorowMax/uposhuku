// lib/requests/format.ts
//
// Умови запиту словами для чипів: «до 15 000 ₴», «Протягом тижня», «Львів»,
// а також спільні підписи панелей запитів: відмінок слова, ціна, строк.

import { CITIES } from "@/lib/map/cities";
import { kyivToday } from "./deadline-date";
import { DEADLINES, type RequestDraft } from "./types";

const PRICE = new Intl.NumberFormat("uk-UA");
const DAY_MONTH = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Своя дата терміну словами: «До 25 листопада»; рік дописуємо, лише коли він не поточний (за Києвом).
 * Дата це календарний день, тож форматуємо її як UTC-північ, без зсуву поясом.
 */
export const deadlineDateLabel = (date: string, now: Date): string => {
  const [year, month, day] = date.split("-").map(Number);
  const when = new Date(Date.UTC(year, month - 1, day));
  const sameYear = date.slice(0, 4) === kyivToday(now).slice(0, 4);
  return `До ${(sameYear ? DAY_MONTH : DAY_MONTH_YEAR).format(when)}`;
};

/**
 * Підпис терміну для показу, єдиний для чипів, стрічки, карти, сторінки запиту й поста в каналі: своя дата, якщо вона є,
 * інакше підпис готового строку (`bucketLabel`); null, коли нічого не вказано.
 */
export const deadlineText = (bucketLabel: string | null | undefined, date: string | null | undefined, now: Date): string | null => (date ? deadlineDateLabel(date, now) : (bucketLabel ?? null));

/** Те саме для запиту з ключем готового строку (`deadline`). */
export const deadlineLabel = (request: Pick<RequestDraft, "deadline" | "deadlineDate">, now: Date): string | null =>
  deadlineText(request.deadline ? DEADLINES[request.deadline] : null, request.deadlineDate, now);

export const requestFacts = (request: Pick<RequestDraft, "budget" | "deadline" | "deadlineDate" | "cityId">, now: Date): string[] => [
  ...(request.budget ? [`до ${PRICE.format(request.budget)} ₴`] : []),
  ...[deadlineLabel(request, now)].filter((label): label is string => label !== null),
  ...(request.cityId ? [CITIES.find((city) => city.id === request.cityId)?.name ?? "Україна"] : []),
];

/** Форма слова за числом: 1 день, 2 дні, 5 днів, 11 днів, 21 день. */
export const plural = (count: number, one: string, few: string, many: string): string => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return one;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
};

export const daysLabel = (days: number): string => `${days} ${plural(days, "день", "дні", "днів")}`;

export const priceLabel = (price: number | null): string =>
  price === null ? "Ціна після обговорення" : `${PRICE.format(price)} ₴`;
