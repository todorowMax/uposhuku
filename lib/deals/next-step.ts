// lib/deals/next-step.ts
//
// Який крок угоди за мною зараз і як підписати кнопку. Чиста функція над `needsAction` (замовник) і
// `performerNeeds` (виконавець): правила станів живуть у machine.ts, тут лише дія й підпис для рядка
// угоди в чаті та для закріпленої кнопки екрана угоди.

import { needsAction, performerNeeds } from "@/lib/deals/machine";
import type { Deal } from "@/lib/deals/types";

export namespace NextStepTypes {
  export type Role = "customer" | "performer";
  /**
   * accept: прийняти умови; pay: оплатити етап безпечної угоди; claim: оплата прямим переказом (реквізити, «Я оплатив» у картці);
   * release: прийняти роботу; confirm_paid: підтвердити отримання оплати; deliver: здати етап;
   * open: крок в екрані угоди, де є власні елементи (ескроу в блокчейні).
   */
  export type Action = "accept" | "pay" | "claim" | "release" | "confirm_paid" | "deliver" | "open";
  export type Step = { action: Action; label: string };
}

const step = (action: NextStepTypes.Action, label: string): NextStepTypes.Step => ({ action, label });

const customerStep = (deal: Deal): NextStepTypes.Step | null => {
  const need = needsAction(deal);
  if (need === "answer") return step("accept", "Прийняти умови");
  if (deal.method === "escrow") {
    if (need === "fund") return step("open", "Внести кошти");
    return need === "confirm" ? step("open", "Прийняти роботу") : null;
  }
  if (need === "fund") return step("pay", "Оплатити");
  if (need === "pay") return step("claim", "Оплатити");
  if (need === "confirm") return step("release", deal.method === "safe" ? "Підтвердити й виплатити" : "Прийняти роботу");
  return null;
};

const performerStep = (deal: Deal): NextStepTypes.Step | null => {
  const need = performerNeeds(deal);
  if (need === "answer") return step("accept", "Прийняти");
  if (need === "confirm") return step("confirm_paid", "Підтвердити оплату");
  if (need !== "deliver") return null;
  return step(deal.method === "escrow" ? "open" : "deliver", "Здати етап");
};

/** Наступний крок, який чекає на мене в цій угоді; null, якщо чекаємо на іншу сторону або банк. */
export const nextStepOf = (deal: Deal, role: NextStepTypes.Role): NextStepTypes.Step | null => {
  return role === "performer" ? performerStep(deal) : customerStep(deal);
};

/** Чи чекає угода на мою дію (для крапки в рядку й лічильника «1 чекає»). */
export const needsMe = (deal: Deal, role: NextStepTypes.Role): boolean => (role === "performer" ? performerNeeds(deal) : needsAction(deal)) !== null;
