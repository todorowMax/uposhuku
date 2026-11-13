"use client";

// components/deals/deal-composer/use-deal-composer.ts
//
// Логіка форми «Запропонувати угоду» за відгуком: суми й етапи, спосіб оплати, перевірка, надсилання.

import { useMemo, useState } from "react";
import { useEscrowAvailable } from "@/components/wallet/use-crypto-config";
import type { StagesEditorTypes } from "@/components/deals/stages-editor";
import { ApiError } from "@/lib/auth/client";
import { proposeDeal } from "@/lib/deals/client";
import { withRiskAck } from "@/lib/legal/client";
import { feeOf, initialMethod, splitIntoStages, validateDraft } from "@/lib/deals/machine";
import { totalOf } from "@/lib/deals/price";
import { useSafeDealOptions } from "@/lib/deals/use-safe-deal";
import type { Deal, DealMethod } from "@/lib/deals/types";
import type { OfferResponse } from "@/lib/requests/types";

export const useDealComposer = (response: OfferResponse, onDone: (deal: Deal) => void) => {
  // Чи доступна безпечна угода цій людині, вирішує сервер. Чи підключив виконавець виплати, він теж перевіряє сам.
  const { ready, safeEnabled, fop, methods } = useSafeDealOptions(response.performerId);
  const escrowAvailable = useEscrowAvailable();
  // Що людина обрала сама; поки не обирала, «Безпечна угода» лише тоді, коли вона справді доступна для цього виконавця.
  const [picked, setPicked] = useState<DealMethod | null>(null);
  const method: DealMethod = picked ?? initialMethod(safeEnabled, fop);
  const setMethod = setPicked;
  const [amount, setAmount] = useState(
    response.price ? String(response.price) : "",
  );
  const [days, setDays] = useState(String(response.days));
  /** Етапи, які людина правила руками; null — рахуємо з суми й терміну. */
  const [custom, setCustom] = useState<StagesEditorTypes.Edit[] | null>(null);
  const [criteria, setCriteria] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount.replace(/\s/g, "")) || 0;
  const daysNumber = Number(days) || 0;

  const stages = useMemo(() => {
    if (custom)
      return custom.map((stage) => ({
        title: stage.title,
        amount: Number(stage.amount.replace(/\s/g, "")) || 0,
        days: Number(stage.days) || 0,
      }));
    if (amountNumber <= 0 || daysNumber <= 0) return [];
    return method !== "safe"
      ? [{ title: "Робота", amount: amountNumber, days: daysNumber }]
      : splitIntoStages(amountNumber, daysNumber);
  }, [method, custom, amountNumber, daysNumber]);

  const total = stages.reduce((sum, stage) => sum + stage.amount, 0);
  const fee = feeOf(total, method);
  const payTotal = useMemo(() => totalOf(stages.map((stage) => stage.amount)), [stages]);
  const performer = {
    id: response.performerId,
    name: response.name,
    photo: response.photo,
    avatarIndex: response.avatarIndex,
    specialty: response.specialty,
    fop,
  };
  const problem = stages.length
    ? validateDraft({
        requestId: response.requestId,
        responseId: response.id,
        performer,
        method,
        stages,
      }, safeEnabled, method === "escrow" ? Number.MAX_SAFE_INTEGER : null)
    : "Вкажіть суму й термін.";

  const submit = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const deal = await withRiskAck(() =>
        proposeDeal({
          requestId: response.requestId,
          responseId: response.id,
          performer,
          method,
          stages,
          ...(criteria.trim() ? { criteria: criteria.trim() } : {}),
        }),
      );
      onDone(deal);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Не вдалося запропонувати угоду.",
      );
    } finally {
      setBusy(false);
    }
  };

  return { ready, safeEnabled, fop, methods, escrowAvailable, method, setMethod, amount, setAmount, days, setDays, custom, setCustom, criteria, setCriteria, agree, setAgree, busy, error, amountNumber, daysNumber, stages, total, fee, payTotal, problem, submit };
};
