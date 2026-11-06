"use client";

// components/deals/terms-form/use-terms-form.ts
//
// Логіка форми умов у розмові: поля, етапи, спосіб оплати, перевірка й надсилання.

import { useMemo, useState } from "react";
import { useEscrowAvailable } from "@/components/wallet/use-crypto-config";
import type { StagesEditorTypes } from "@/components/deals/stages-editor";
import { ApiError } from "@/lib/auth/client";
import type { ConversationDto } from "@/lib/chat/types";
import { proposeTerms } from "@/lib/deals/client";
import { feeOf, initialMethod, splitIntoStages, validateDraft } from "@/lib/deals/machine";
import { totalOf } from "@/lib/deals/price";
import { useSafeDealOptions } from "@/lib/deals/use-safe-deal";
import type { DealMethod } from "@/lib/deals/types";

export const useTermsForm = (conversation: Pick<ConversationDto, "id" | "performerId">, onDone: () => void) => {
  // Чи доступна безпечна угода цій людині, вирішує сервер. Чи підключив виконавець виплати, він теж перевіряє сам.
  const { ready, safeEnabled, fop, methods } = useSafeDealOptions(conversation.performerId);
  const escrowAvailable = useEscrowAvailable();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  // Що людина обрала сама; поки не обирала, «Безпечна угода» лише тоді, коли вона справді доступна цій парі.
  const [picked, setPicked] = useState<DealMethod | null>(null);
  const method: DealMethod = picked ?? initialMethod(safeEnabled, fop);
  const setMethod = setPicked;
  const [custom, setCustom] = useState<StagesEditorTypes.Edit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount.replace(/\s/g, "")) || 0;
  const daysNumber = Number(days) || 0;
  // Свої етапи є лише в прямому переказі: безпечну угоду ділимо автоматично під холд.
  const stages = useMemo(() => {
    if (method !== "safe" && custom)
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

  const problem = !title.trim()
    ? "Назвіть замовлення."
    : stages.length === 0
      ? "Вкажіть суму й термін."
      : validateDraft({
          requestId: "",
          responseId: "",
          performer: {
            id: conversation.performerId,
            name: "",
            avatarIndex: 0,
            specialty: "",
            fop,
          },
          method,
          stages,
        }, safeEnabled, method === "escrow" ? Number.MAX_SAFE_INTEGER : null);
  const total = stages.reduce((sum, stage) => sum + stage.amount, 0);
  const fee = feeOf(total, method);
  const payTotal = useMemo(() => totalOf(stages.map((stage) => stage.amount)), [stages]);

  const submit = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await proposeTerms(conversation.id, { title: title.trim(), description: description.trim(), criteria: criteria.trim(), method, stages });
      onDone();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Немає зв'язку. Спробуйте ще раз.",
      );
    } finally {
      setBusy(false);
    }
  };


  return { ready, safeEnabled, fop, methods, escrowAvailable, title, setTitle, description, setDescription, criteria, setCriteria, amount, setAmount, days, setDays, method, setMethod, custom, setCustom, busy, error, amountNumber, daysNumber, stages, problem, total, fee, payTotal, submit };
};
