"use client";

// components/chat/direct-deals.tsx
//
// Умови й угоди, які виставляють прямо в розмові, без запиту: форма «Оформити умови»
// і список угод цієї пари. Той самий об'єкт, що й відгук, тільки навпаки: умови може
// виставити будь-яка сторона, друга приймає. Далі угода йде звичним шляхом (DealView).

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { DealView } from "@/components/deals/deal-tab";
import { StagesEditor, type StagesEditorTypes } from "@/components/deals/stages-editor";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ApiError } from "@/lib/auth/client";
import type { ConversationDto } from "@/lib/chat/types";
import { loadDeals, useDeals } from "@/lib/deals/client";
import { AcceptedMethods } from "@/components/deals/accepted-methods";
import { useSafeDealOptions } from "@/lib/deals/use-safe-deal";
import { money, moneyIn } from "@/lib/deals/format";
import { feeOf, initialMethod, splitIntoStages, validateDraft } from "@/lib/deals/machine";
import { CommissionRow } from "@/components/deals/commission-row";
import { EscrowMethodOption } from "@/components/deals/escrow-method-option";
import { useEscrowAvailable } from "@/components/wallet/use-crypto-config";
import { COMMISSION_RATE, formatKop, totalOf } from "@/lib/deals/price";
import {
  HOLD_DAYS,
  currencyOfMethod,
  directRequestId,
  type DealMethod,
} from "@/lib/deals/types";
import { startPolling } from "@/lib/realtime/client";


const CURRENCY_SIGN = { UAH: "₴", USDT: "USDT" } as const;

/** Угоди цієї розмови для замовника: тримаємо свіжими, поки відкрито. */
export function DirectDeals({
  conversation,
}: {
  conversation: ConversationDto;
}) {
  const requestId = directRequestId(conversation.id);
  const deals = useDeals(requestId);
  useEffect(() => {
    void loadDeals(requestId);
    return startPolling(() => void loadDeals(requestId), 4000, ["deal"]);
  }, [requestId]);
  const live = deals.filter(
    (deal) => deal.status !== "declined" && deal.status !== "cancelled",
  );
  if (live.length === 0) return null;
  return (
    <div className="grid gap-3">
      {live.map((deal) => (
        <DealView key={deal.id} deal={deal} />
      ))}
    </div>
  );
}

/**
 * Форма умов: назва замовлення, опис, сума, термін, спосіб оплати. Етапи рахуємо
 * самі (довгу роботу ділимо під холд). Платить завжди замовник; виконавець отримує
 * свою ціну повністю, а замовник у безпечній угоді доплачує комісії платформи й банку.
 */
export function TermsForm({
  conversation,
  onDone,
  onCancel,
}: {
  conversation: ConversationDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Чи доступна безпечна угода цій людині, вирішує сервер. Чи підключив виконавець виплати, він теж перевіряє сам.
  const { ready, safeEnabled, fop, methods } = useSafeDealOptions(conversation.performerId);
  const escrowAvailable = useEscrowAvailable();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/deals`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            method,
            stages,
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as {
        detail?: string;
        title?: string;
      } | null;
      if (!response.ok)
        throw new ApiError(
          data?.detail ?? data?.title ?? "Не вдалося виставити умови.",
        );
      await loadDeals(directRequestId(conversation.id));
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

  return (
    <div className="deal terms-form">
      <p className="auth-lead">
        Домовились? Зафіксуйте замовлення: що робимо, за скільки й за який час.
        Друга сторона приймає або відхиляє.
      </p>

      <Field label="Назва замовлення" htmlFor="terms-title">
        <Input
          id="terms-title"
          value={title}
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Лендинг для кав'ярні"
        />
      </Field>

      <Field label="Що входить" optional htmlFor="terms-description">
        <Textarea
          id="terms-description"
          rows={2}
          value={description}
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Дизайн, верстка, форма замовлення"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label={`Сума, ${CURRENCY_SIGN[currencyOfMethod(method)]}`} htmlFor="terms-amount">
          <Input
            id="terms-amount"
            inputMode="numeric"
            value={method !== "safe" && custom ? String(stages.reduce((sum, stage) => sum + stage.amount, 0)) : amount}
            disabled={method !== "safe" && Boolean(custom)}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^\d\s]/g, ""))
            }
            placeholder="12 500"
            className="tabular-nums"
          />
        </Field>
        <Field label="Термін, днів" htmlFor="terms-days">
          <Input
            id="terms-days"
            inputMode="numeric"
            value={method !== "safe" && custom ? String(stages.reduce((sum, stage) => sum + stage.days, 0)) : days}
            disabled={method !== "safe" && Boolean(custom)}
            onChange={(event) =>
              setDays(event.target.value.replace(/\D/g, "").slice(0, 3))
            }
            placeholder="14"
            className="tabular-nums"
          />
        </Field>
      </div>

      <fieldset className="deal-methods" hidden={!safeEnabled && !escrowAvailable}>
        <legend className="pe-label">Як платити</legend>
        <label
          className="deal-method"
          data-selected={method === "safe" || undefined}
          data-disabled={!fop || undefined}
          hidden={!safeEnabled}
        >
          <input
            type="radio"
            name="terms-method"
            checked={method === "safe"}
            disabled={!fop}
            onChange={() => setMethod("safe")}
          />
          <span className="text-[14px] font-semibold text-ink">
            Безпечна угода{" "}
            {fop && <span className="deal-badge">Рекомендуємо</span>}
          </span>
          <span className="deal-method-text">
            {!ready
              ? "Перевіряємо, чи виконавець підключив виплати."
              : fop
              ? `Гроші заморожуємо на картці замовника на ${HOLD_DAYS} днів і віддаємо виконавцю після підтвердження. Виконавець отримує свою ціну повністю, а замовник платить ще комісію ${Math.round(COMMISSION_RATE * 100)}%.`
              : "Недоступна: виконавець ще не підключив виплати на картку ФОП."}
          </span>
        </label>
        <label
          className="deal-method"
          data-selected={method === "direct" || undefined}
        >
          <input
            type="radio"
            name="terms-method"
            checked={method === "direct"}
            onChange={() => setMethod("direct")}
          />
          <span className="text-[14px] font-semibold text-ink">
            Прямий переказ
          </span>
          <span className="deal-method-text">
            Без комісії, одним платежем або за етапами. Без гарантії платформи.
          </span>
        </label>
        {escrowAvailable && <EscrowMethodOption id="terms-escrow" selected={method === "escrow"} onChange={(on) => setMethod(on ? "escrow" : null)} />}
      </fieldset>
      {method === "direct" && <AcceptedMethods methods={methods} />}
      {!safeEnabled && !escrowAvailable && (
        <p className="pe-hint">
          Оплата прямим переказом, одним платежем або за етапами: без комісії
          платформи й без її гарантії.
        </p>
      )}

      {method !== "safe" && stages.length > 0 && (
        <StagesEditor method={method} stages={stages} amount={amountNumber} days={daysNumber} custom={custom} onCustom={setCustom} />
      )}

      {stages.length > 0 && (
        <dl className="deal-summary">
          <div>
            <dt>Вартість роботи (отримає виконавець)</dt>
            <dd className="tabular-nums">{moneyIn(total, currencyOfMethod(method))}</dd>
          </div>
          {method === "safe" && (
            <>
              <CommissionRow amount={money(fee)} />
              <div>
                <dt>Замовник заплатить</dt>
                <dd className="tabular-nums">
                  {formatKop(payTotal)}
                </dd>
              </div>
            </>
          )}
          {stages.length > 1 && (
            <div>
              <dt>Етапів</dt>
              <dd className="tabular-nums">{stages.length}</dd>
            </div>
          )}
        </dl>
      )}

      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="auth-primary"
          style={{ width: "auto", padding: "0 20px" }}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Надіслати умови
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="auth-link text-[13px]"
        >
          Скасувати
        </button>
      </div>
      {problem &&
        !error &&
        amountNumber > 0 &&
        daysNumber > 0 &&
        title.trim() && <p className="pe-hint text-[#a4513c]">{problem}</p>}
    </div>
  );
}
