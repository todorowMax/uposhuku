"use client";

// components/deals/deal-screen/use-deal-screen.ts
//
// Логіка екрана угоди: дії замовника й виконавця, перехід на оплату, підтвердження приймання, текст помилки.
// Правила станів — у lib/deals/machine.ts, який крок за мною — у lib/deals/next-step.ts; тут лише ефекти.

import { useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { dealAction, performerAction, startPayment } from "@/lib/deals/client";
import { currentStage } from "@/lib/deals/machine";
import { nextStepOf, type NextStepTypes } from "@/lib/deals/next-step";
import type { PaymentMethod } from "@/lib/deals/requisites";
import type { Deal, DealStage } from "@/lib/deals/types";

export namespace DealScreenState {
  export type Options = { deal: Deal; role: NextStepTypes.Role; onChanged: (deal: Deal) => void };
  type Fields = { deliveryText?: string; deliveryLink?: string };
  export type Value = ReturnType<typeof useDealScreen>;
  export type PerformerAct = (action: Parameters<typeof performerAction>[1], extra?: Fields) => Promise<boolean>;
}

/** Кроки, що виконуються закріпленою кнопкою внизу; решта кроків має власні елементи в тілі екрана. */
const FOOTER_STEPS = new Set<NextStepTypes.Action>(["accept", "pay", "claim", "release", "confirm_paid", "deliver", "open"]);

const reason = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

export const useDealScreen = ({ deal, role, onChanged }: DealScreenState.Options) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Шторка підтвердження приймання й екран оплати переказом: обидва відкриває закріплена кнопка.
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [paying, setPaying] = useState(false);
  // Екрани здачі етапу й ескроу відкривають закріплена кнопка або кнопка в етапі.
  const [delivering, setDelivering] = useState(false);
  const [escrowOpen, setEscrowOpen] = useState(false);
  const stage = currentStage(deal);
  const step = nextStepOf(deal, role);

  /** Дія замовника з угодою чи етапом. */
  const run = async (action: Parameters<typeof dealAction>[1], target?: DealStage, extra: { code?: string; via?: PaymentMethod } = {}) => {
    setBusy(action);
    setError(null);
    try {
      onChanged(await dealAction(deal, action, { stageId: target?.id, ...extra }));
      setConfirmRelease(false);
      return true;
    } catch (failure) {
      setError(reason(failure, "Не вдалося виконати дію."));
      return false;
    } finally {
      setBusy(null);
    }
  };

  /** Дія виконавця. */
  const act: DealScreenState.PerformerAct = async (action, extra = {}) => {
    setBusy(action);
    setError(null);
    try {
      onChanged(await performerAction(deal, action, extra));
      return true;
    } catch (failure) {
      setError(reason(failure, "Немає зв'язку. Спробуйте ще раз."));
      return false;
    } finally {
      setBusy(null);
    }
  };

  /** Оплата етапу: рахунок у банку, далі йдемо на його сторінку. Статус «заморожено» поставить сам банк. */
  const pay = async () => {
    setBusy("fund");
    setError(null);
    try {
      window.location.assign(await startPayment(deal));
    } catch (failure) {
      setError(reason(failure, "Не вдалося перейти до оплати."));
      setBusy(null);
    }
  };

  const answer = (action: "accept" | "decline") => (role === "performer" ? act(action) : run(action));

  /** Закріплена кнопка внизу: виконує крок, який за мною. */
  const doStep = () => {
    if (!step) return;
    if (step.action === "pay") return void pay();
    if (step.action === "release") return setConfirmRelease(true);
    if (step.action === "claim") return setPaying(true);
    if (step.action === "deliver") return setDelivering(true);
    if (step.action === "open") return setEscrowOpen(true);
    if (step.action === "confirm_paid") return void act("confirm_paid");
    void answer("accept");
  };

  const footerStep = step && FOOTER_STEPS.has(step.action) ? step : null;

  return { busy, error, stage, step, footerStep, confirmRelease, setConfirmRelease, paying, setPaying, delivering, setDelivering, escrowOpen, setEscrowOpen, run, act, answer, doStep };
};
