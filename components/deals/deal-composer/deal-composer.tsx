"use client";

// components/deals/deal-composer/deal-composer.tsx
//
// Форма «Запропонувати угоду» за відгуком виконавця: сума, етапи, спосіб оплати. Показується на екрані
// (шар «екран»), коли за відгуком ще немає угоди.

import { QrCode, ShieldCheck } from "@/components/icons";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field, Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { AcceptedMethods } from "@/components/deals/accepted-methods";
import { CommissionRow } from "@/components/deals/commission-row";
import { CriteriaField } from "@/components/deals/criteria-field";
import { EscrowMethodOption } from "@/components/deals/escrow-method-option";
import { StagesEditor } from "@/components/deals/stages-editor";
import { money, moneyIn } from "@/lib/deals/format";
import { COMMISSION_RATE, formatKop } from "@/lib/deals/price";
import { currencyOfMethod, type DealMethod } from "@/lib/deals/types";
import type { useDealComposer } from "./use-deal-composer";

const CURRENCY_SIGN = { UAH: "₴", USDT: "USDT" } as const;
const FEE_NOTE: Record<DealMethod, string> = { safe: "", direct: "немає", escrow: "за контрактом, видно перед внесенням" };
const AGREE_TEXT: Record<DealMethod, string> = {
  safe: "Розумію: гроші заморожуються на картці до підтвердження, а спір має закінчитися до кінця холду.",
  direct: "Розумію: це прямий переказ, платформа не гарантує повернення грошей, а податки сторони вирішують самі.",
  escrow: "Розумію: кошти лягають у контракт у блокчейні, платформа ними не володіє, а спір вирішує арбітр у мережі.",
};

export namespace DealComposerTypes {
  export type Value = ReturnType<typeof useDealComposer>;
}

/** Поля пропозиції; кнопка «Запропонувати угоду» стоїть у закріпленому низу екрана (deal-composer-screen.tsx). */
export const DealComposer = ({ form }: { form: DealComposerTypes.Value }) => {
  const { ready, safeEnabled, fop, methods, escrowAvailable, method, setMethod, amount, setAmount, days, setDays, custom, setCustom, criteria, setCriteria, agree, setAgree, amountNumber, daysNumber, stages, total, fee, payTotal, problem, error } = form;
  return (
    <div className="deal">
      <p className="auth-lead">
        {safeEnabled
          ? "Зафіксуйте домовленість: суму, терміни й спосіб оплати. Виконавець побачить пропозицію й погодиться."
          : "Зафіксуйте домовленість: суму й терміни. Виконавець побачить пропозицію й погодиться."}
      </p>

      <CriteriaField id="deal-criteria" value={criteria} onChange={setCriteria} />

      <div className="grid grid-cols-2 gap-2">
        <Field label={`Сума, ${CURRENCY_SIGN[currencyOfMethod(method)]}`} htmlFor="deal-amount">
          <Input
            id="deal-amount"
            inputMode="numeric"
            value={custom ? String(total) : amount}
            disabled={Boolean(custom)}
            onChange={(event) =>
              setAmount(event.target.value.replace(/[^\d\s]/g, ""))
            }
            placeholder="12 500"
            className="tabular-nums"
          />
        </Field>
        <Field label="Термін, днів" htmlFor="deal-days">
          <Input
            id="deal-days"
            inputMode="numeric"
            value={
              custom
                ? String(stages.reduce((sum, stage) => sum + stage.days, 0))
                : days
            }
            disabled={Boolean(custom)}
            onChange={(event) =>
              setDays(event.target.value.replace(/\D/g, "").slice(0, 3))
            }
            placeholder="14"
            className="tabular-nums"
          />
        </Field>
      </div>

      <fieldset className="deal-methods" hidden={!safeEnabled && !escrowAvailable}>
        <legend id="deal-method-label" className="pe-label">Як платити</legend>
        <RadioGroup value={method === "safe" || method === "direct" ? method : ""} onValueChange={(value) => setMethod(value as "safe" | "direct")} aria-labelledby="deal-method-label">
          {safeEnabled && (
            <RadioCard
              id="deal-method-safe"
              value="safe"
              disabled={!fop}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="size-4 text-ink" />
                  Безпечна угода
                  {fop && <span className="deal-badge">Рекомендуємо</span>}
                </span>
              }
              hint={
                !ready
                  ? "Перевіряємо, чи виконавець підключив виплати."
                  : fop
                  ? `Гроші заморожуємо на вашій картці й віддаємо виконавцю, коли ви підтвердите роботу. Виконавець отримує свою ціну повністю, а до оплати додаємо комісію ${Math.round(COMMISSION_RATE * 100)}%.`
                  : "Недоступна: виконавець ще не підключив виплати на картку ФОП."
              }
            />
          )}
          <RadioCard
            id="deal-method-direct"
            value="direct"
            title={
              <span className="flex items-center gap-2">
                <QrCode className="size-4 text-ink-muted" />
                Прямий переказ
              </span>
            }
            hint="Без комісії, переказ на рахунок виконавця: одним платежем або за етапами. Без гарантії платформи: у спорі гроші ми не повертаємо."
          />
        </RadioGroup>
        {escrowAvailable && <EscrowMethodOption id="deal-escrow" selected={method === "escrow"} onChange={(on) => setMethod(on ? "escrow" : null)} />}
      </fieldset>
      {method === "direct" && <AcceptedMethods methods={methods} />}
      {!safeEnabled && !escrowAvailable && (
        <p className="pe-hint">
          Оплата прямим переказом виконавцю: без комісії платформи й без її
          гарантії, у спорі гроші ми не повертаємо.
        </p>
      )}

      {stages.length > 0 && (
        <StagesEditor
          method={method}
          stages={stages}
          amount={amountNumber}
          days={daysNumber}
          custom={custom}
          onCustom={setCustom}
        />
      )}

      <dl className="deal-summary">
        {method === "safe" ? (
          <>
            <div>
              <dt>Вартість роботи (отримає виконавець)</dt>
              <dd className="tabular-nums">{money(total)}</dd>
            </div>
            <CommissionRow amount={money(fee)} />
            <div>
              <dt>До оплати</dt>
              <dd className="tabular-nums">
                {stages.length > 0 ? formatKop(payTotal) : "—"}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Ви платите</dt>
              <dd className="tabular-nums">{moneyIn(total, currencyOfMethod(method))}</dd>
            </div>
            <div>
              <dt>Комісія платформи</dt>
              <dd>{FEE_NOTE[method]}</dd>
            </div>
          </>
        )}
      </dl>

      <CheckboxField id="deal-agree" checked={agree} onCheckedChange={(value) => setAgree(value === true)} label={<span className="text-xs leading-snug text-ink-muted">{AGREE_TEXT[method]}</span>} />

      {problem && agree && !error && stages.length > 0 && (
        <p className="auth-error">{problem}</p>
      )}
    </div>
  );
};
