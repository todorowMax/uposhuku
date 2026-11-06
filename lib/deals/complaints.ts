// lib/deals/complaints.ts
//
// Скарга сторони на пряму угоду. Гроші й статус етапу вона не змінює: прямий переказ іде повз нас, тож повернути
// його ми не можемо. Скарга лише потрапляє до модератора разом із хронологією угоди. Чисті правила без бази.

import type { Checked } from "./dispute-aids";
import type { Deal, DealStage } from "./types";

export const COMPLAINT_REASONS = ["no_delivery", "no_payment", "quality", "no_contact", "other"] as const;
export type ComplaintReason = (typeof COMPLAINT_REASONS)[number];

export const COMPLAINT_REASON_LABEL: Record<ComplaintReason, string> = {
  no_delivery: "Оплатив(ла), але роботу не здано",
  no_payment: "Роботу здано, а оплату не отримано",
  quality: "Робота не відповідає умовам",
  no_contact: "Друга сторона не виходить на зв'язок",
  other: "Інше",
};

export const isComplaintReason = (value: unknown): value is ComplaintReason => COMPLAINT_REASONS.some((reason) => reason === value);

export const COMPLAINT_TEXT_MIN = 10;
export const COMPLAINT_TEXT_MAX = 1000;

/** Прямо в тексті для людини: на що скарга не впливає. */
export const COMPLAINT_NOTE = "Прямий переказ ми повернути не можемо: скарга не змінює ні гроші, ні статус етапу. Модератор побачить її разом з умовами, листуванням і відмітками угоди.";

/** Один рядок для стрічки розмови: другій стороні не розкриваємо ні автора, ні причину, ні текст. */
export const complaintNotice = (dealNumber: string): string => `За угодою ${dealNumber} подано скаргу. Прямий переказ ми повернути не можемо; модератор побачить скаргу разом з листуванням.`;

/** Етапи, на які можна скаржитися: оплату вже позначено (є про що казати), угода не закрита без оплати. */
const COMPLAINT_STAGE_STATUSES: DealStage["status"][] = ["claimed", "funded", "delivered", "released"];

export const complaintStageError = (deal: Pick<Deal, "method" | "status">, stage: Pick<DealStage, "status"> | undefined): string | null => {
  if (deal.method !== "direct") return "Скарга потрібна лише в угоді з прямим переказом. В інших угодах є «Є претензії».";
  if (deal.status !== "accepted" && deal.status !== "completed") return "Угоду ще не прийнято.";
  if (!stage) return "Етапу не знайдено.";
  return COMPLAINT_STAGE_STATUSES.includes(stage.status) ? null : "Скаржитися можна, коли оплату вже позначено.";
};

export interface ComplaintInput {
  reason: ComplaintReason;
  text: string;
}

export const checkComplaint = (rawReason: unknown, rawText: unknown): Checked<ComplaintInput> => {
  if (!isComplaintReason(rawReason)) return { ok: false, error: "Оберіть причину скарги." };
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (text.length < COMPLAINT_TEXT_MIN) return { ok: false, error: `Опишіть, що сталося: хоча б ${COMPLAINT_TEXT_MIN} символів.` };
  if (text.length > COMPLAINT_TEXT_MAX) return { ok: false, error: `Опис задовгий: до ${COMPLAINT_TEXT_MAX} символів.` };
  return { ok: true, value: { reason: rawReason, text } };
};
