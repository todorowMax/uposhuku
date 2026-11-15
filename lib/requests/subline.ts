// lib/requests/subline.ts
//
// Підпис запиту в списку «Мої запити»: що з ним зараз (шукаємо виконавців, є відгуки, питання «Ще актуально?», закрито, протерміновано).
// Чиста функція: час і лічильник передає той, хто викликає (ARCH-10).

import { restoreLeftLabel } from "./restore";
import type { PublishedRequest } from "./types";

const plural = (count: number, one: string, few: string, many: string) => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return one;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
};

export const offerLabel = (count: number) => `${count} ${plural(count, "пропозиція", "пропозиції", "пропозицій")}`;

const closedSubline = (request: Pick<PublishedRequest, "closeReason" | "restoreUntil">, now: number): string => {
  const left = restoreLeftLabel(request.restoreUntil, now);
  const word = request.closeReason === "expired" ? "Протермінований" : "Закритий";
  if (left === null) return word;
  return request.closeReason === "expired" ? `${word} · ${left}` : `Закрито · ${left}`;
};

/** `count`: скільки відгуків; undefined, поки лічильники не прийшли. */
export const requestSubline = (request: Pick<PublishedRequest, "status" | "closeReason" | "restoreUntil" | "renewalDeadline">, count: number | undefined, now: number): string => {
  if (request.status === "closed") return closedSubline(request, now);
  if (request.renewalDeadline !== null) return "Ще актуально?";
  if (count === undefined) return "Шукаємо виконавців";
  return count === 0 ? "Очікує відгуків" : offerLabel(count);
};
