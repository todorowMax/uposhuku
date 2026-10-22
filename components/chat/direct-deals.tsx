"use client";

// components/chat/direct-deals.tsx
//
// Умови й угоди, які виставляють прямо в розмові, без запиту: форма «Оформити умови»
// і список угод цієї пари. Той самий об'єкт, що й відгук, тільки навпаки: умови може
// виставити будь-яка сторона, друга приймає. Далі угода йде звичним шляхом (DealView).

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { DealView } from "@/components/deals/deal-tab";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ApiError } from "@/lib/auth/client";
import type { ConversationDto } from "@/lib/chat/types";
import { loadDeals, useDeals } from "@/lib/deals/client";
import { isFop } from "@/lib/deals/fop";
import { feeOf, splitIntoStages, validateDraft } from "@/lib/deals/machine";
import {
  HOLD_DAYS,
  SAFE_FEE,
  directRequestId,
  type DealMethod,
} from "@/lib/deals/types";
import { startPolling } from "@/lib/realtime/client";

const PRICE = new Intl.NumberFormat("uk-UA");
const money = (value: number) => `${PRICE.format(value)} ₴`;

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
 * суму за мінусом комісії безпечної угоди.
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
  const fop = isFop(conversation.performerId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const [method, setMethod] = useState<DealMethod>(fop ? "safe" : "direct");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNumber = Number(amount.replace(/\s/g, "")) || 0;
  const daysNumber = Number(days) || 0;
  const stages = useMemo(() => {
    if (amountNumber <= 0 || daysNumber <= 0) return [];
    return method === "direct"
      ? [{ title: "Робота", amount: amountNumber, days: daysNumber }]
      : splitIntoStages(amountNumber, daysNumber);
  }, [method, amountNumber, daysNumber]);

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
        });
  const fee = feeOf(amountNumber, method);

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
        <Field label="Сума, ₴" htmlFor="terms-amount">
          <Input
            id="terms-amount"
            inputMode="numeric"
            value={amount}
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
            value={days}
            onChange={(event) =>
              setDays(event.target.value.replace(/\D/g, "").slice(0, 3))
            }
            placeholder="14"
            className="tabular-nums"
          />
        </Field>
      </div>

      <fieldset className="deal-methods">
        <legend className="pe-label">Як платити</legend>
        <label
          className="deal-method"
          data-selected={method === "safe" || undefined}
          data-disabled={!fop || undefined}
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
            {fop
              ? `Гроші заморожуємо на картці замовника й віддаємо виконавцю після підтвердження. До ${HOLD_DAYS} днів на етап. Комісія ${Math.round(SAFE_FEE * 100)}%.`
              : "Недоступна: виконавець не ФОП."}
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
            Прямий переказ за QR
          </span>
          <span className="deal-method-text">
            Без комісії, одним платежем. Без гарантії платформи.
          </span>
        </label>
      </fieldset>

      {amountNumber > 0 && (
        <dl className="deal-summary">
          <div>
            <dt>Платить замовник</dt>
            <dd className="tabular-nums">{money(amountNumber)}</dd>
          </div>
          <div>
            <dt>Виконавець отримає</dt>
            <dd className="tabular-nums">{money(amountNumber - fee)}</dd>
          </div>
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
