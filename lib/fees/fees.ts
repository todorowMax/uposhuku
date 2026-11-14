// lib/fees/fees.ts
//
// Комісія за фактом: чиста логіка без читання часу й середовища (ARCH-10). Площадка не торкається грошей людей,
// вона лише веде журнал: коли оплату етапу підтверджено, на замовника лягає відсоток. Усі суми в копійках.
// Модель і рішення власника: docs/tasks/2026-11-14-postpaid-commission.md.

import type { Deal, DealStage } from "@/lib/deals/types";
import type { FeeTypes } from "./fees.types";

/** Ставка за замовчуванням для нових угод, базисні пункти (5%). У угоді її записують при створенні, і саме записана діє. */
export const POSTPAID_FEE_BP = 500;

/** Найменша оплата комісії, копійки (100 ₴): менше можна лише коли борг сам менший. */
export const MIN_FEE_PAYMENT_KOP = 10_000;

const KOP = 100;
const BP = 10_000;

/** Комісія від бази, копійки: ціле, округлення до найближчої копійки (половина вгору). */
export const feeFor = (baseKop: number, rateBp: number): number => Math.round((baseKop * rateBp) / BP);

/** Сума етапу в копійках (суми угод цілі гривні, Math.round лише від похибки). */
export const stageBaseKop = (stage: Pick<DealStage, "amount">): number => Math.round(stage.amount * KOP);

/**
 * Чи етап оплачено для комісії. Рахуємо лише прямий переказ (будь-який спосіб: картка, IBAN, USDT, Binance, PayPal, Wise):
 * комісія нараховується, коли замовник натиснув «Я оплатив(ла)» (claimed), а funded, delivered і released покривають етап,
 * який дійшов туди повз claimed. Безпечна угода (7% уже зверху) і ескроу (контракт) комісії за фактом не дають ніколи.
 */
export const isStagePaid = (deal: Pick<Deal, "method">, stage: DealStage): boolean =>
  deal.method === "direct" && (stage.status === "claimed" || stage.status === "funded" || stage.status === "delivered" || stage.status === "released");

/**
 * Нарахування, які треба записати, коли угода змінилась з `before` на `after`: етапи, що стали оплаченими, а коли
 * угода щойно стала completed, ще й усі оплачені етапи (раптом якийсь пропустили). Повторний виклик дає той самий
 * список: ідемпотентність забезпечує унікальний індекс журналу, а не ця функція.
 * Нараховуємо лише з угод `direct`, де записано `fee`.
 */
export const accrualsFor = (before: Deal | null, after: Deal): FeeTypes.Accrual[] => {
  if (!after.fee || after.method !== "direct") return [];
  const { rateBp } = after.fee;
  const justCompleted = after.status === "completed" && before?.status !== "completed";
  return after.stages
    .filter((stage) => {
      if (!isStagePaid(after, stage)) return false;
      const earlier = before?.stages.find((item) => item.id === stage.id);
      return justCompleted || !earlier || !isStagePaid(after, earlier);
    })
    .map((stage) => {
      const baseKop = stageBaseKop(stage);
      return { dealId: after.id, stageId: stage.id, baseKop, rateBp, amountKop: feeFor(baseKop, rateBp) };
    });
};

/** Баланс журналу: що платник винен (додатне) чи переплатив (від'ємне). */
export const balanceOf = (entries: readonly FeeTypes.Amounted[]): number => entries.reduce((sum, entry) => sum + entry.amountKop, 0);
