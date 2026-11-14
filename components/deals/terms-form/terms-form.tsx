"use client";

// components/deals/terms-form/terms-form.tsx
//
// Форма умов: назва замовлення, опис, сума, термін, спосіб оплати. Етапи рахуємо самі (довгу роботу ділимо
// під холд). Платить завжди замовник; виконавець отримує свою ціну повністю, а замовник у безпечній угоді
// доплачує комісії платформи й банку. Показується на екрані (шар «екран»).

import { Field, Input, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { AcceptedMethods } from "@/components/deals/accepted-methods";
import { CommissionRow } from "@/components/deals/commission-row";
import { CriteriaField } from "@/components/deals/criteria-field";
import { DisputeTips } from "@/components/deals/dispute-tips";
import { EscrowMethodOption } from "@/components/deals/escrow-method-option";
import { PaymentModesHint } from "@/components/fees/payment-modes-hint";
import { PostpaidFeeRow } from "@/components/fees/postpaid-fee-row";
import { StagesEditor } from "@/components/deals/stages-editor";
import { money, moneyIn } from "@/lib/deals/format";
import { COMMISSION_RATE, formatKop } from "@/lib/deals/price";
import { HOLD_DAYS, currencyOfMethod } from "@/lib/deals/types";
import type { useTermsForm } from "./use-terms-form";

const CURRENCY_SIGN = { UAH: "₴", USDT: "USDT" } as const;

export namespace TermsFormTypes {
  export type Value = ReturnType<typeof useTermsForm>;
}

/** Поля умов; кнопка «Надіслати» стоїть у закріпленому низу екрана (terms-screen.tsx). */
export const TermsForm = ({ form }: { form: TermsFormTypes.Value }) => {
  const { postpaidFee, ready, safeEnabled, fop, methods, escrowAvailable, title, setTitle, description, setDescription, criteria, setCriteria, amount, setAmount, days, setDays, method, setMethod, custom, setCustom, error, amountNumber, daysNumber, stages, problem, total, fee, payTotal } = form;
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
        <legend id="terms-method-label" className="pe-label">Як платити</legend>
        <RadioGroup value={method === "safe" || method === "direct" ? method : ""} onValueChange={(value) => setMethod(value as "safe" | "direct")} aria-labelledby="terms-method-label">
          {safeEnabled && (
            <RadioCard
              id="terms-method-safe"
              value="safe"
              disabled={!fop}
              title={
                <>
                  Безпечна угода {fop && <span className="deal-badge">Рекомендуємо</span>}
                </>
              }
              hint={
                !ready
                  ? "Перевіряємо, чи виконавець підключив виплати."
                  : fop
                  ? `Гроші заморожуємо на картці замовника на ${HOLD_DAYS} днів і віддаємо виконавцю після підтвердження. Виконавець отримує свою ціну повністю, а замовник платить ще комісію ${Math.round(COMMISSION_RATE * 100)}%.`
                  : "Недоступна: виконавець ще не підключив виплати на картку ФОП."
              }
            />
          )}
          <RadioCard id="terms-method-direct" value="direct" title="Прямий переказ" hint={postpaidFee ? "Одним платежем або за етапами. Комісія платформи нараховується на ваш рахунок. Без гарантії платформи." : "Без комісії, одним платежем або за етапами. Без гарантії платформи."} />
        </RadioGroup>
        {escrowAvailable && <EscrowMethodOption id="terms-escrow" selected={method === "escrow"} onChange={(on) => setMethod(on ? "escrow" : null)} />}
      </fieldset>
      {postpaidFee && <PaymentModesHint />}
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
          {method === "direct" && postpaidFee && <PostpaidFeeRow totalUah={total} />}
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
      {problem &&
        !error &&
        amountNumber > 0 &&
        daysNumber > 0 &&
        title.trim() && <p className="auth-error">{problem}</p>}
    </div>
  );
};
