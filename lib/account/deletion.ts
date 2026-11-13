// lib/account/deletion.ts
//
// Чисті правила видалення акаунта: що вважаємо «грошима в русі», як виглядає «могила», коли минає строк
// зберігання. Бази тут немає, усе дістається з угоди або з аргументів (lib/server/account-delete.ts робить записи).

import type { Deal } from "@/lib/deals/types";

/** Скільки років після останньої угоди тримаємо записи, потрібні сторонам для захисту прав (загальна позовна давність). */
export const RETENTION_YEARS = 3;
export const RETENTION_MS = RETENTION_YEARS * 365 * 24 * 60 * 60 * 1000;

/** Слово, яке людина вводить, щоб підтвердити видалення. */
export const DELETE_WORD = "ВИДАЛИТИ";

/** Як підписуємо автора, чий акаунт видалено: у чаті, угодах, адмінці. */
export const DELETED_NAME = "Видалений користувач";

/** Підпис автора відгуку, коли акаунт видалено (відгук лишається, ім'я ні). */
export const DELETED_REVIEW_AUTHOR = "Замовник";

/** Пошта «могили»: така адреса не існує, тож на неї не можна ні увійти, ні надіслати лист. */
export const tombstoneEmail = (userId: string): string => `deleted-${userId}@deleted.invalid`;

export const isTombstoneEmail = (email: string): boolean => email.endsWith("@deleted.invalid");

export const isDeleteWord = (value: unknown): boolean => typeof value === "string" && value.trim().toLocaleUpperCase("uk") === DELETE_WORD;

/** Етап, де гроші вже рухаються або чекають підтвердження сторони. */
const MONEY_STAGES = new Set(["claimed", "funded", "delivered", "releasing", "disputed", "refunding"]);
const FINAL_STAGES = new Set(["released", "refunded"]);

const stageInMotion = (deal: Deal, stage: Deal["stages"][number]): boolean => {
  if (MONEY_STAGES.has(stage.status)) return true;
  // Ескроу: адреса контракту етапу вже відома, а етап не закрито: гроші можуть бути в контракті.
  return deal.method === "escrow" && Boolean(stage.escrow) && !FINAL_STAGES.has(stage.status);
};

export type DealGrip = "money" | "idle" | "closed";

/**
 * Що ця угода означає для видалення акаунта.
 * money: прийнята чи запропонована, гроші в русі, видаляти не можна;
 * idle: ще жива, але грошей немає (пропозиція, прийнята без оплати): її скасовуємо, щоб друга сторона не платила в порожнечу;
 * closed: завершена, відхилена чи скасована: не чіпаємо.
 */
export const dealGrip = (deal: Deal): DealGrip => {
  if (deal.status !== "proposed" && deal.status !== "accepted") return "closed";
  return deal.stages.some((stage) => stageInMotion(deal, stage)) ? "money" : "idle";
};

/** Угода закрита (завершена, відхилена чи скасована). */
export const isClosedDeal = (deal: Deal): boolean => dealGrip(deal) === "closed";

/** Чи був у угоді спір (зараз чи колись): тоді знімок реквізитів потрібен модератору й суду, поки не мине строк. */
export const hadDispute = (deal: Deal): boolean => Boolean(deal.disputed) || deal.stages.some((stage) => Boolean(stage.disputedAt));

/** Знімок реквізитів виконавця можна стерти одразу: угода закрита, без спору й скарг. */
export const requisitesDeletableNow = (deal: Deal, hasComplaint: boolean): boolean => isClosedDeal(deal) && !hadDispute(deal) && !hasComplaint;

/** Строк зберігання від останньої зміни закритої угоди минув. */
export const retentionExpired = (closedAt: number, now: number): boolean => now - closedAt >= RETENTION_MS;

/** Угода без імені виконавця, який пішов: ім'я й фото замінені, решта як була. */
export const withoutPerformerIdentity = (deal: Deal): Deal => ({ ...deal, performer: { ...deal.performer, name: DELETED_NAME, specialty: "", photo: undefined } });

/** Чому не можна видалити: одна позиція зі списку для людини. */
export interface DeleteBlocker {
  kind: "money" | "complaint";
  dealId: string;
  number: string;
  /** Розмова, де видно угоду; null, якщо її не знайдено. */
  conversationId: string | null;
  reason: string;
}

export const moneyBlocker = (deal: Deal, conversationId: string | null, why = "гроші ще в русі"): DeleteBlocker => ({
  kind: "money",
  dealId: deal.id,
  number: deal.number,
  conversationId,
  reason: `Угода ${deal.number}: ${why}.`,
});

export const complaintBlocker = (deal: Deal, conversationId: string | null): DeleteBlocker => ({
  kind: "complaint",
  dealId: deal.id,
  number: deal.number,
  conversationId,
  reason: `Угода ${deal.number}: є відкрита скарга, її має розглянути модератор.`,
});

/** Прибирання за строком іде раз на добу: перше п'ятихвилинне вікно після 03:00 UTC (cron воркера крутиться кожні 5 хвилин). */
export const isRetentionWindow = (now: number): boolean => {
  const at = new Date(now);
  return at.getUTCHours() === 3 && at.getUTCMinutes() < 5;
};
