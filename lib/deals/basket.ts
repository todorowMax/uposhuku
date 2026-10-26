// lib/deals/basket.ts
//
// Корзина етапу для рахунку Monobank і план виплати. Банк фіналізує й повертає
// гроші лише по позиціях корзини (тест 26.10.2026): довільну суму він відхиляє.
// Тому частки виконавця й платформи ріжемо на рівні частини заздалегідь, і
// виплату «60%» робимо, фіналізувавши 12 частин із 20. Чисті функції, суми в копійках.

import { splitShares } from "./price";
import type { StagePayment } from "./types";

/** На скільки частин ріжемо долю виконавця й долю платформи: крок виплати 100 / BASKET_PARTS = 5%. */
export const BASKET_PARTS = 20;

/** Позиція корзини в тому вигляді, якого чекає банк. qty завжди 1: частини вже рівні. */
export interface BasketItem {
  name: string;
  qty: 1;
  sum: number;
  code: string;
  splitReceiverId: string;
}

export interface StageReceivers {
  performer: string;
  platform: string;
}

/** Що робити з холдом: виплатити все, виплатити частину (з позиціями) чи повернути гроші заказчику. */
export type Payout =
  | { kind: "full"; amount: number }
  | { kind: "partial"; amount: number; items: BasketItem[] }
  | { kind: "refund" };

const sumOf = (items: BasketItem[]): number => items.reduce((total, item) => total + item.sum, 0);

/** Ріже суму на рівні частини: різниця між частинами не більша за копійку, сума збігається з вхідною. */
export const sliceAmount = (total: number, parts: number): number[] => {
  const base = Math.floor(total / parts);
  const rest = total - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < rest ? 1 : 0));
};

interface PartSpec {
  kind: "work" | "fee";
  index: number;
  sum: number;
  receiver: string;
}

const part = ({ kind, index, sum, receiver }: PartSpec): BasketItem => ({
  name: `${kind === "work" ? "Робота виконавця" : "Комісія платформи"}, частина ${index + 1}`,
  qty: 1,
  sum,
  code: `${kind}-${index + 1}`,
  splitReceiverId: receiver,
});

/**
 * Корзина етапу: `parts` частин виконавця (його доля = ціна + комісія банку) і
 * `parts` частин платформи (її комісія). Сума корзини дорівнює сумі «до оплати».
 */
export const buildBasket = (payment: StagePayment, receivers: StageReceivers, parts = BASKET_PARTS): BasketItem[] => {
  const shares = splitShares(payment);
  const work = sliceAmount(shares.performer, parts);
  const fee = sliceAmount(shares.platform, parts);
  // Нульова позиція банку не годиться: сума етапу від MIN_DEAL цього не допускає, а помилка краще за мовчазний збій.
  if ([...work, ...fee].some((sum) => sum < 1)) throw new Error("Етап надто малий, щоб розрізати його на частини");
  return [
    ...work.map((sum, index) => part({ kind: "work", index, sum, receiver: receivers.performer })),
    ...fee.map((sum, index) => part({ kind: "fee", index, sum, receiver: receivers.platform })),
  ];
};

/** Скільки частин виплатити за часткою виконавця 0..1: округлюємо до кроку, менше половини кроку це повернення. */
export const releasedParts = (share: number, parts = BASKET_PARTS): number => Math.round(Math.min(1, Math.max(0, share)) * parts);

const partOf = (item: BasketItem): number => Number(item.code.split("-")[1]);

/**
 * План виплати за кількістю частин виконавця. Комісію платформи фіналізуємо
 * пропорційно: стільки самих частин, скільки виплачено виконавцю. Повна виплата
 * йде без корзини (банк приймає суму холду як є), нуль частин це повернення.
 */
export const planPayout = (basket: BasketItem[], released: number, parts = BASKET_PARTS): Payout => {
  if (released <= 0) return { kind: "refund" };
  if (released >= parts) return { kind: "full", amount: sumOf(basket) };
  const items = basket.filter((item) => partOf(item) <= released);
  return { kind: "partial", amount: sumOf(items), items };
};
