// lib/fees/view.ts
//
// Як комісія за фактом виглядає для людей: суми, дати, підписи рядків рахунку, рядок у формі умов. Чисті функції без
// часу й середовища (час приходить ззовні), гроші й дати лише через Intl (LANG-3). Копійки показує `formatKop`
// із lib/deals/price: цілі гривні без копійок, решта з двома знаками.

import { formatKop } from "@/lib/deals/price";
import { feeFor, POSTPAID_FEE_BP } from "./fees";
import type { FeeTypes } from "./fees.types";

const PERCENT = new Intl.NumberFormat("uk-UA", { style: "percent", maximumFractionDigits: 2 });
const DAY = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "long", year: "numeric" });
const SHORT_DAY = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "short", year: "numeric" });

const FAILED = new Set(["failure", "expired", "reversed"]);

/** Мінус із довгою рискою, а не дефіс: «−1 100 ₴» не плутається з переносом. */
const MINUS = "−";
const NBSP = " ";

/** Ставка словами: 500 → «5%». */
export const rateText = (rateBp: number): string => PERCENT.format(rateBp / 10_000);

/** Дата без «р.» наприкінці: «14 квітня 2027». */
const dayText = (format: Intl.DateTimeFormat, iso: string): string =>
  format
    .formatToParts(new Date(iso))
    .filter((part) => part.type === "day" || part.type === "month" || part.type === "year" || (part.type === "literal" && part.value.trim() === ""))
    .map((part) => part.value)
    .join("")
    .trim();

/** «14 квітня 2027»: строк оплати. */
export const dueText = (iso: string): string => dayText(DAY, iso);

/** «14 лист. 2026»: дата запису в списку. */
export const entryDateText = (iso: string): string => dayText(SHORT_DAY, iso);

/** Борг людини: перевищення нарахувань над оплатами, не менше нуля (переплата боргом не є). */
export const debtKop = (balanceKop: number): number => Math.max(0, balanceKop);

/** Сума запису зі знаком: нарахування «+1 100 ₴», оплата «−1 100 ₴». */
export const signedKop = (amountKop: number): string => {
  if (amountKop === 0) return formatKop(0);
  return `${amountKop > 0 ? "+" : MINUS}${formatKop(Math.abs(amountKop))}`;
};

/** Слово, яким підписано запис, щоб стан не тримався лише на кольорі (DS-8). */
export const kindLabel = (kind: FeeTypes.EntryKind): string => {
  if (kind === "accrual") return "Нараховано";
  if (kind === "payment") return "Сплачено";
  return "Коригування";
};

/** Головний рядок запису: за що це. */
export const entryTitle = (entry: FeeTypes.EntryView): string => {
  if (entry.kind === "payment") return "Оплата комісії";
  if (entry.dealNumber) return entry.stageTitle ? `Угода ${entry.dealNumber} · етап «${entry.stageTitle}»` : `Угода ${entry.dealNumber}`;
  return entry.note ?? kindLabel(entry.kind);
};

/** Розрахунок нарахування: «22 000 ₴ × 5%»; null, коли бази чи ставки в записі немає. */
export const entryFormula = (entry: FeeTypes.EntryView): string | null =>
  entry.baseKop !== null && entry.rateBp !== null ? `${formatKop(entry.baseKop)}${NBSP}×${NBSP}${rateText(entry.rateBp)}` : null;

/** Пункт «Рахунок» у меню видно, коли комісія ввімкнена, є борг чи є хоч один запис. */
export const showFeesItem = (overview: FeeTypes.Overview | null): boolean =>
  overview !== null && (overview.enabled || overview.entries.length > 0 || overview.balanceKop !== 0);

/** Що казати про рахунок за його статусом у банку. */
export const invoiceOutcome = (status: string): FeeTypes.InvoiceOutcome => (status === "success" ? "paid" : FAILED.has(status) ? "failed" : "pending");

/** Комісія для рядка у формі умов: від загальної суми угоди в гривнях, у копійках. Нуль для нульової чи від'ємної суми. */
export const formFeeKop = (totalUah: number, rateBp: number = POSTPAID_FEE_BP): number => (totalUah > 0 ? feeFor(Math.round(totalUah * 100), rateBp) : 0);

/** Рядок у формі умов: «Комісія платформи 5% · 1 100 ₴». */
export const formFeeLabel = (rateBp: number = POSTPAID_FEE_BP): string => `Комісія платформи ${rateText(rateBp)}`;
export const formFeeAmount = (totalUah: number, rateBp: number = POSTPAID_FEE_BP): string => formatKop(formFeeKop(totalUah, rateBp));
