// lib/requests/format.ts
//
// Умови запиту словами для чипів: «до 15 000 ₴», «Протягом тижня», «Львів»,
// а також спільні підписи панелей запитів: відмінок слова, ціна, строк.

import { CITIES } from "@/lib/map/cities";
import { DEADLINES, type RequestDraft } from "./types";

const PRICE = new Intl.NumberFormat("uk-UA");

export const requestFacts = (request: Pick<RequestDraft, "budget" | "deadline" | "cityId">): string[] => [
  ...(request.budget ? [`до ${PRICE.format(request.budget)} ₴`] : []),
  ...(request.deadline ? [DEADLINES[request.deadline]] : []),
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
