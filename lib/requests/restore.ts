// lib/requests/restore.ts
//
// Відновлення закритого запиту: чи ще можна й скільки лишилось. Час `now` передає той, хто викликає (ARCH-10).

import type { PublishedRequest } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DAYS = new Intl.NumberFormat("uk-UA", { style: "unit", unit: "day", unitDisplay: "long" });
const HOURS = new Intl.NumberFormat("uk-UA", { style: "unit", unit: "hour", unitDisplay: "short" });

/** Закритий запит, чия доба на відновлення ще йде. Сервер перевіряє це сам, тут лише вирішуємо, чи показувати кнопку. */
export const canRestore = (request: Pick<PublishedRequest, "status" | "restoreUntil">, now: number): boolean =>
  request.status === "closed" && request.restoreUntil !== null && Date.parse(request.restoreUntil) > now;

/** «можна відновити ще 5 год» або «ще менше години»; null, коли час минув або запит не закритий. */
export const restoreLeftLabel = (restoreUntil: string | null, now: number): string | null => {
  if (restoreUntil === null) return null;
  const left = Date.parse(restoreUntil) - now;
  if (!(left > 0)) return null;
  // Вікно «протермінованого» запиту триває 7 днів: від двох діб рахуємо в днях, інакше вийде «168 год».
  if (left >= 2 * DAY_MS) return `можна відновити ще ${DAYS.format(Math.floor(left / DAY_MS))}`;
  return left < HOUR_MS ? "можна відновити ще менше години" : `можна відновити ще ${HOURS.format(Math.floor(left / HOUR_MS))}`;
};
