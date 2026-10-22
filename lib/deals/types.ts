// lib/deals/types.ts
//
// Угода між замовником і виконавцем, домовлена в чаті. Два способи оплати,
// як у плані: «безпечна угода» (гроші заморожуються до підтвердження, холд до
// 30 днів, комісія платформи, лише для виконавців-ФОП) і «прямий
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
  /** На скільки днів етап; для safe не більше MAX_STAGE_DAYS (решта холду йде на перевірку й спір). */
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
  /** Що замовник заморозив: розбивка суми на момент оплати. Лише safe, з моменту funded. */
  payment?: StagePayment;
}

/** Тип картки замовника: від нього залежить комісія банку за приймання платежу. */
export type CardKind = "ua" | "foreign";

/** Розбивка оплати етапу, у копійках. total = price + fee + bankFee. */
export interface StagePayment {
  card: CardKind;
  /** Ціна виконавця: стільки він отримує повністю. */
  price: number;
  /** Винагорода платформи, SAFE_FEE від ціни. */
  fee: number;
  /** Комісія банку за приймання платежу, закладена в суму замовника. */
  bankFee: number;
  /** Скільки замовник платить і заморожує. */
  total: number;
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

/** Холд, який банк увімкнув нам (домовленість 22.10.2026). Стандартний холд monobank 9 днів. */
export const HOLD_DAYS = 30;
/** Скільки робочих днів замовник перевіряє здану роботу; мовчання після цього — приймання. */
export const REVIEW_DAYS = 3;
/** Календарних днів холду, які лишаємо на перевірку (REVIEW_DAYS робочих) і можливий спір. */
export const HOLD_RESERVE_DAYS = 6;
/** Найдовший етап безпечної угоди: холд мінус запас на перевірку й спір. */
export const MAX_STAGE_DAYS = HOLD_DAYS - HOLD_RESERVE_DAYS;
/** Комісія платформи з безпечної угоди, частка від ціни виконавця. Прямий переказ — без комісії. */
export const SAFE_FEE = 0.05;
/** Комісія банку за приймання платежу: частка від суми, яку платить замовник. Тарифи банку на 22.10.2026. */
export const ACQUIRING_RATE: Record<CardKind, number> = { ua: 0.013, foreign: 0.02 };
export const MAX_STAGES = 6;
export const MIN_DEAL = 100;
/** Ліміт на один етап безпечної угоди, ₴ (ціна виконавця). Домовленість з банком 22.10.2026. */
export const MAX_STAGE_AMOUNT = 100_000;
/** Сума безпечної угоди не більша за етапи, помножені на ліміт етапу. */
export const MAX_DEAL = MAX_STAGES * MAX_STAGE_AMOUNT;
/** Прямий переказ іде повз банк-еквайр, тож ліміту етапу немає. */
export const MAX_DIRECT_DEAL = 1_000_000;

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
