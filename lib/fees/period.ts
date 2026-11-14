// lib/fees/period.ts
//
// Квартал і строк оплати комісії за київським часом (Europe/Kyiv). Чисті функції: «зараз» передають ззовні.
// Межі кварталу рахуємо за місцевою датою в Києві (Intl дає рік і місяць для моменту), а не за UTC: перша секунда
// кварталу в Києві настає на 2-3 години раніше за UTC, і запис опівночі не має потрапити в чужий квартал.

import type { FeeTypes } from "./fees.types";

const ZONE = "Europe/Kyiv";
/** Скільки днів після кінця кварталу дається на оплату. */
export const DUE_GRACE_DAYS = 14;

const partsFormat = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });

interface Local {
  year: number;
  month: number;
  day: number;
}

const localParts = (ms: number): Record<string, number> => Object.fromEntries(partsFormat.formatToParts(ms).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));

const localOf = (ms: number): Local => {
  const { year, month, day } = localParts(ms);
  return { year, month, day };
};

/** Зсув Києва від UTC у мілісекундах на цей момент (літній і зимовий час). */
const offsetAt = (ms: number): number => {
  const p = localParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};

/** Момент, коли в Києві настає місцевий час `day` `hour:minute:second.ms` (день може виходити за місяць: Date.UTC нормалізує). */
const kyivInstant = (local: Local & { hour?: number; minute?: number; second?: number; ms?: number }): number => {
  const { hour = 0, minute = 0, second = 0, ms = 0 } = local;
  const naive = Date.UTC(local.year, local.month - 1, local.day, hour, minute, second, ms);
  // Двічі: перший зсув взято для наближеного моменту, а за переходу годинника він може відрізнятися.
  const first = naive - offsetAt(naive - 3 * 3_600_000);
  return naive - offsetAt(first);
};

export const quarterOf = (now: number): FeeTypes.Quarter => {
  const { year, month } = localOf(now);
  return { year, quarter: (Math.floor((month - 1) / 3) + 1) as FeeTypes.Quarter["quarter"] };
};

/**
 * Строк оплати: кінець поточного кварталу плюс 14 днів, до кінця цього дня за Києвом. Для IV кварталу 2026 це
 * 14 січня 2027, 23:59:59.999 за Києвом. Повертає ISO.
 */
export const dueDateFor = (now: number): string => {
  const { year, quarter } = quarterOf(now);
  // Квартал закінчується останнім днем його третього місяця, тож 14-те число місяця після нього це «кінець + 14 днів».
  // Місяць 13 Date.UTC сам перетворює на січень наступного року.
  const due = kyivInstant({ year, month: quarter * 3 + 1, day: DUE_GRACE_DAYS, hour: 23, minute: 59, second: 59, ms: 999 });
  return new Date(due).toISOString();
};
