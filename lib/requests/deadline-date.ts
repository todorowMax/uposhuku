// lib/requests/deadline-date.ts
//
// Своя дата «до» у запиті. Чисті функції без читання годинника: «зараз» передає той, хто викликає (ARCH-10).
// Дата це календарний день за Києвом (`YYYY-MM-DD`) без часу, тож зсуву на добу через пояс немає.
// Готовий строк (`Deadline`) виводиться з кількості днів один раз, під час збереження, і потім не перераховується:
// фільтри, ранг і підбір читають його, а не дату.

import type { Deadline } from "./types";

const DEADLINE_TIME_ZONE = "Europe/Kyiv";
/** Найдальша дата від сьогодні, днів. */
export const DEADLINE_MAX_DAYS = 365;
/** Дата, яку пропонує поле, коли людина обрала «Вказати дату»: через два тижні. */
export const DEADLINE_DEFAULT_DAYS = 14;

const KYIV_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: DEADLINE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Сьогоднішня дата за Києвом, `YYYY-MM-DD`. */
export const kyivToday = (now: Date): string => KYIV_DATE.format(now);

/** Рядок `YYYY-MM-DD` як номер доби (UTC-північ); null, якщо це не справжня календарна дата. */
const dayNumber = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const real = new Date(time);
  // Date.UTC «виправляє» 31 лютого на березень: порівнюємо складові назад.
  if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return null;
  return Math.round(time / DAY_MS);
};

const isoOfDay = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Дата через `days` днів від сьогодні за Києвом. */
export const addKyivDays = (now: Date, days: number): string => isoOfDay((dayNumber(kyivToday(now)) as number) + days);

/** Межі вибору для поля дати: від сьогодні до сьогодні + 365 днів, і дата за замовчуванням (через 14 днів). */
export const deadlineWindow = (now: Date): { min: string; max: string; fallback: string } => ({
  min: kyivToday(now),
  max: addKyivDays(now, DEADLINE_MAX_DAYS),
  fallback: addKyivDays(now, DEADLINE_DEFAULT_DAYS),
});

/** Скільки діб від сьогодні до дати: 0 — сьогодні, від'ємне — минула; null, якщо рядок не дата. */
export const daysUntil = (date: unknown, now: Date): number | null => {
  const target = dayNumber(date);
  return target === null ? null : target - (dayNumber(kyivToday(now)) as number);
};

/** Готовий строк за кількістю днів: до 3 — терміново, до 7 — тиждень, до 14 — два тижні, до 31 — місяць, далі «не горить». */
export const bucketForDays = (days: number): Deadline => {
  if (days <= 3) return "asap";
  if (days <= 7) return "week";
  if (days <= 14) return "two_weeks";
  if (days <= 31) return "month";
  return "flexible";
};

export type DeadlineDateResult = { ok: true; date: string; deadline: Deadline } | { ok: false; reason: string };

/** Перевірка своєї дати й готовий строк до неї. Причина відмови це текст для людини. */
export const resolveDeadlineDate = (value: unknown, now: Date): DeadlineDateResult => {
  const days = daysUntil(value, now);
  if (days === null) return { ok: false, reason: "Дата терміну має вигляд РРРР-ММ-ДД." };
  if (days < 0) return { ok: false, reason: "Дата терміну вже минула." };
  if (days > DEADLINE_MAX_DAYS) return { ok: false, reason: `Термін не може бути далі ніж ${DEADLINE_MAX_DAYS} днів.` };
  return { ok: true, date: value as string, deadline: bucketForDays(days) };
};
