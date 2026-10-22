// lib/admin/format.ts
//
// Підписи й дати для адмінки. Час показуємо за Києвом, «зараз» передаємо ззовні.

import type { Deal, DealStage } from "@/lib/deals/types";

const TZ = "Europe/Kyiv";
const stamp = new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = new Intl.DateTimeFormat("uk-UA", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const money = new Intl.NumberFormat("uk-UA");

export const formatStamp = (iso: string | null | undefined) => (iso ? stamp.format(new Date(iso)) : "");
export const formatDay = (iso: string | null | undefined) => (iso ? day.format(new Date(iso)) : "");
export const formatMoney = (value: number) => `${money.format(value)} ₴`;

export const STAGE_STATE: Record<DealStage["status"], string> = {
  pending: "Чекає оплату",
  claimed: "Оплату позначено",
  funded: "Оплачено, у роботі",
  delivered: "Здано, чекає підтвердження",
  released: "Виплачено",
  disputed: "Спір",
  refunded: "Кошти повернено",
};

export const DEAL_STATE: Record<Deal["status"], string> = {
  proposed: "Пропозиція",
  accepted: "Прийнято",
  completed: "Завершено",
  declined: "Відхилено",
  cancelled: "Скасовано",
};

export const METHOD_LABEL: Record<Deal["method"], string> = { safe: "Безпечна угода", direct: "Прямий переказ" };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Скільки лишилось до кінця холду: текст і тон (late — збіг, soon — менше доби). */
export const holdLeft = (holdUntil: string | null | undefined, now: number): { text: string; tone: "ok" | "soon" | "late" } | null => {
  if (!holdUntil) return null;
  const left = Date.parse(holdUntil) - now;
  if (!Number.isFinite(left)) return null;
  if (left <= 0) return { text: "Холд збіг", tone: "late" };
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  if (days === 0) return { text: hours === 0 ? "Холд закінчується за годину" : `Холд ще ${hours} год`, tone: "soon" };
  return { text: `Холд ще ${days} дн ${hours} год`, tone: "ok" };
};

/** Скільки спір відкритий: «2 дн», «5 год», «щойно». */
export const openFor = (openedAt: string, now: number): string => {
  const spent = now - Date.parse(openedAt);
  if (!Number.isFinite(spent) || spent < HOUR) return "щойно";
  if (spent < DAY) return `${Math.floor(spent / HOUR)} год`;
  return `${Math.floor(spent / DAY)} дн`;
};
