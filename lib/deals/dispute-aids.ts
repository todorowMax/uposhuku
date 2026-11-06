// lib/deals/dispute-aids.ts
//
// Що фіксуємо в угоді, щоб у разі суперечки було на що спертися: критерії готовності, чек, результат етапу.
// Чисті функції: перевірка тексту від людини й запис у угоду. Перевіряє сервер, клієнт лише підказує.

import type { Deal, StageDelivery } from "./types";

export const CRITERIA_MAX = 500;
export const DELIVERY_TEXT_MAX = 1000;
export const DELIVERY_LINK_MAX = 500;

/** Атрибут `rel` для посилань на чужі ресурси: результат виконавця веде на сторонній сайт. */
export const EXTERNAL_LINK_REL = "noopener noreferrer";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const clean = (raw: unknown): string => (typeof raw === "string" ? raw.trim() : "");

/** Критерії готовності: порожньо означає «не вказано» (value undefined). */
export const checkCriteria = (raw: unknown): Checked<string | undefined> => {
  if (raw !== undefined && raw !== null && typeof raw !== "string") return { ok: false, error: "Критерії мають бути текстом." };
  const text = clean(raw);
  if (text.length > CRITERIA_MAX) return { ok: false, error: `«Що вважаємо готовим»: до ${CRITERIA_MAX} символів.` };
  return { ok: true, value: text || undefined };
};

/** Посилання на результат: лише https, без логіна й пароля в адресі, з крапкою в імені хоста. Повертає нормалізоване. */
export const normalizeDeliveryLink = (raw: string): string | null => {
  if (raw.length > DELIVERY_LINK_MAX) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
  return url.toString();
};

/** Результат етапу: пояснення до 1000 символів і посилання https. Обидва необов'язкові; порожній результат це undefined. */
export const checkDelivery = (rawText: unknown, rawLink: unknown): Checked<StageDelivery | undefined> => {
  if ((rawText !== undefined && rawText !== null && typeof rawText !== "string") || (rawLink !== undefined && rawLink !== null && typeof rawLink !== "string")) {
    return { ok: false, error: "Результат має бути текстом." };
  }
  const text = clean(rawText);
  const link = clean(rawLink);
  if (text.length > DELIVERY_TEXT_MAX) return { ok: false, error: `Опис результату: до ${DELIVERY_TEXT_MAX} символів.` };
  const normalized = link ? normalizeDeliveryLink(link) : undefined;
  if (link && !normalized) return { ok: false, error: "Посилання на результат має починатися з https:// і вести на сайт." };
  if (!text && !normalized) return { ok: true, value: undefined };
  return { ok: true, value: { ...(text ? { text } : {}), ...(normalized ? { link: normalized } : {}) } };
};

const mapStage = (deal: Deal, stageId: string, patch: Partial<Deal["stages"][number]>): Deal => ({
  ...deal,
  stages: deal.stages.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage)),
});

/** Дописує результат у етап (після «здати етап»). Без результату угоду не чіпає. */
export const withDelivery = (deal: Deal, stageId: string, delivery: StageDelivery | undefined): Deal => (delivery ? mapStage(deal, stageId, { delivery }) : deal);

/** Дописує чек у етап. */
export const withReceipt = (deal: Deal, stageId: string, receipt: { attachmentId: string; now: number }): Deal =>
  mapStage(deal, stageId, { receiptAttachmentId: receipt.attachmentId, receiptAt: new Date(receipt.now).toISOString() });

/** Чек можна додати, поки етап чекає оплати чи підтвердження оплати. */
export const canAttachReceipt = (deal: Pick<Deal, "method" | "status">, stageStatus: string): boolean =>
  deal.method === "direct" && deal.status === "accepted" && (stageStatus === "pending" || stageStatus === "claimed" || stageStatus === "funded");
