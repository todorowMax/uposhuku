// lib/deals/types.ts
//
// Угода між замовником і виконавцем, домовлена в чаті. Два способи оплати,
// як у плані: «безпечна угода» (гроші заморожуються до підтвердження, до 9
// днів на етап, комісія платформи, лише для виконавців-ФОП) і «прямий
// переказ за QR» (без комісії й без гарантії платформи).

export type DealMethod = "safe" | "direct";

/**
 * Етап: safe — pending → funded (гроші заморожено) → delivered (виконавець
 * здав) → released (виплачено) або disputed. direct — pending → claimed
 * («я оплатив») → funded (виконавець підтвердив) → delivered → released.
 * Спір розв'язує модератор: released (виплата), refunded (повернення замовнику)
 * або назад у funded (на доопрацювання).
 */
export type StageStatus = "pending" | "claimed" | "funded" | "delivered" | "released" | "disputed" | "refunded";

export interface DealStage {
  id: string;
  title: string;
  /** Сума етапу, ₴. */
  amount: number;
  /** На скільки днів етап; для safe не більше HOLD_DAYS. */
  days: number;
  status: StageStatus;
  claimedAt?: string;
  fundedAt?: string;
  deliveredAt?: string;
  releasedAt?: string;
  /** Коли відкрито спір. */
  disputedAt?: string;
  /** Коли модератор повернув кошти замовнику. */
  refundedAt?: string;
  /** Коли модератор повернув етап на доопрацювання. */
  reworkAt?: string;
  /** Коли банк скасує холд, якщо його не фіналізовано. Лише safe. */
  holdUntil?: string;
}

export type DealStatus = "proposed" | "accepted" | "completed" | "declined" | "cancelled";

/** Хто виконавець угоди: копія з відгуку, щоб картка не ходила по профілі. */
export interface DealParty {
  id: string;
  name: string;
  photo?: string;
  avatarIndex: number;
  specialty: string;
  /** Виконавець-ФОП: безпечна угода лише для таких. */
  fop: boolean;
}

export interface Deal {
  id: string;
  requestId: string;
  responseId: string;
  performer: DealParty;
  method: DealMethod;
  status: DealStatus;
  stages: DealStage[];
  createdAt: string;
  acceptedAt?: string;
  /** Номер для призначення платежу й спорів: «#A1B2». */
  number: string;
  /** Є спір на одному з етапів. */
  disputed?: boolean;
  /** Угода з розмови, без запиту: назва замовлення й опис умов. */
  title?: string;
  description?: string;
  conversationId?: string;
  /** Хто виставив умови. Для угод із відгуку це завжди замовник; у розмові — будь-яка сторона. */
  proposedBy?: "customer" | "performer";
}

export type DealAction = "fund" | "claim_paid" | "release" | "dispute" | "cancel" | "accept" | "decline";

/** Рішення модератора у спорі: виплатити виконавцю, повернути замовнику, повернути етап на доопрацювання. */
export type ModeratorAction = "release" | "refund" | "rework";

/** Дії виконавця: прийняти чи відхилити пропозицію, підтвердити, що гроші отримано, здати етап. */
export type PerformerAction = "accept" | "decline" | "confirm_paid" | "deliver" | "withdraw";

export const HOLD_DAYS = 9;
/** Комісія платформи з безпечної угоди, частка. Прямий переказ — без комісії. */
export const SAFE_FEE = 0.05;
export const MAX_STAGES = 6;
export const MIN_DEAL = 100;
export const MAX_DEAL = 1_000_000;

export interface DealDraft {
  requestId: string;
  responseId: string;
  performer: DealParty;
  method: DealMethod;
  stages: { title: string; amount: number; days: number }[];
  title?: string;
  description?: string;
  conversationId?: string;
  proposedBy?: "customer" | "performer";
}

/** Умови з розмови не прив'язані до запиту: ці значення стоять у колонках замість id запиту й відгуку. */
export const directRequestId = (conversationId: string) => `direct:${conversationId}`;
export const DIRECT_RESPONSE_ID = "direct";
