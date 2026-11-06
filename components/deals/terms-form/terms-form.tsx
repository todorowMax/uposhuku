"use client";

// components/deals/terms-form/terms-form.tsx
//
// Форма умов: назва замовлення, опис, сума, термін, спосіб оплати. Етапи рахуємо самі (довгу роботу ділимо
// під холд). Платить завжди замовник; виконавець отримує свою ціну повністю, а замовник у безпечній угоді
// доплачує комісії платформи й банку. Показується на екрані (шар «екран»).

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { AcceptedMethods } from "@/components/deals/accepted-methods";
import { CommissionRow } from "@/components/deals/commission-row";
import { CriteriaField } from "@/components/deals/criteria-field";
import { DisputeTips } from "@/components/deals/dispute-tips";
import { EscrowMethodOption } from "@/components/deals/escrow-method-option";
import { StagesEditor } from "@/components/deals/stages-editor";
import type { ConversationDto } from "@/lib/chat/types";
import { money, moneyIn } from "@/lib/deals/format";
import { COMMISSION_RATE, formatKop } from "@/lib/deals/price";
import { HOLD_DAYS, currencyOfMethod } from "@/lib/deals/types";
import { useTermsForm } from "./use-terms-form";

const CURRENCY_SIGN = { UAH: "₴", USDT: "USDT" } as const;

export const TermsForm = ({ conversation, onDone, onCancel }: { conversation: Pick<ConversationDto, "id" | "performerId">; onDone: () => void; onCancel: () => void }) => {
  const { ready, safeEnabled, fop, methods, escrowAvailable, title, setTitle, description, setDescription, criteria, setCriteria, amount, setAmount, days, setDays, method, setMethod, custom, setCustom, busy, error, amountNumber, daysNumber, stages, problem, total, fee, payTotal, submit } = useTermsForm(conversation, onDone);
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

      <CriteriaField id="terms-criteria" value={criteria} onChange={setCriteria} />

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
          {/* eslint-disable-next-line no-restricted-syntax -- перенесена форма без змін: власний вибір способу оплати, замінить RadioCard в ітерації C */}
          <input
            type="radio"
            name="terms-method"
            checked={method === "safe"}
            disabled={!fop}
            onChange={() => setMethod("safe")}
          />
          <span className="text-sm font-semibold text-ink">
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
          {/* eslint-disable-next-line no-restricted-syntax -- перенесена форма без змін: власний вибір способу оплати, замінить RadioCard в ітерації C */}
          <input
            type="radio"
            name="terms-method"
            checked={method === "direct"}
            onChange={() => setMethod("direct")}
          />
          <span className="text-sm font-semibold text-ink">
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

      <DisputeTips />
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={() => void submit()} disabled={busy} className="px-5">
          {busy && <Loader2 className="size-4 animate-spin" />}
          Надіслати умови
        </Button>
        <Button variant="link" onClick={onCancel} className="text-sm">
          Скасувати
        </Button>
      </div>
      {problem &&
        !error &&
        amountNumber > 0 &&
        daysNumber > 0 &&
        title.trim() && <p className="auth-error">{problem}</p>}
    </div>
  );
};
