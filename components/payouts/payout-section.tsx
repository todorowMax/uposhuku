"use client";

// components/payouts/payout-section.tsx
//
// Розділ кабінету виконавця «Виплати за безпечну угоду»: щоб замовник міг оплатити безпечну угоду, виконавець-ФОП
// подає назву ФОП, ІПН і підтверджує рахунок у monobank. Стани: завантаження, помилка з повтором, форма, заявка
// чекає перевірки, підключено. Розділу немає, поки безпечна угода вимкнена.

import type { KeyboardEvent } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field, Input } from "@/components/ui/input";
import { OFFER_PATH } from "@/lib/deals/payout";
import { usePayoutForm } from "./use-payout-form";

export const PayoutSection = () => {
  const form = usePayoutForm();
  const { state, fields } = form;
  const onEnter = (event: KeyboardEvent) => {
    // Розділ стоїть усередині форми профілю: Enter не має зберігати профіль.
    if (event.key !== "Enter") return;
    event.preventDefault();
    void form.submit();
  };
  if (form.load === "ready" && !state?.available) return null;
  const payout = state?.payout;

  return (
    <section className="pe-section" aria-labelledby="pe-payout">
      <h2 id="pe-payout" className="pe-title">
        Виплати за безпечну угоду
      </h2>
      <p className="pe-hint -mt-1">Безпечна угода лише для ФОП з рахунком у monobank. Гроші замовника заморожуються в банку й після підтвердження роботи йдуть вам.</p>

      {form.load === "loading" && (
        <p role="status" className="pe-hint flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Завантажуємо стан…
        </p>
      )}

      {form.load === "error" && (
        <div className="grid gap-2">
          <p role="alert" className="auth-error">
            {form.loadError}
          </p>
          <Button variant="secondary" onClick={() => void form.reload()} className="w-auto">
            Спробувати ще раз
          </Button>
        </div>
      )}

      {form.load === "ready" && payout?.status === "active" && (
        <p className="pe-notice" role="status">
          Виплати підключено: {payout.fopName}, ІПН {payout.taxIdMask}.
        </p>
      )}

      {form.load === "ready" && payout?.status === "pending" && (
        <p className="pe-notice" role="status">
          Заявку подано ({payout.fopName}, ІПН {payout.taxIdMask}). Ми звіримо її з банком і підключимо виплати.
        </p>
      )}

      {form.load === "ready" && (!payout || payout.status === "rejected") && (
        <div className="grid gap-3">
          <Field label="Назва ФОП" htmlFor="pe-payout-name" hint="Як у реєстрі, наприклад «ФОП Іваненко Іван Іванович».">
            <Input id="pe-payout-name" autoComplete="organization" value={fields.fopName} maxLength={100} onChange={(event) => form.setField("fopName", event.target.value)} onKeyDown={onEnter} />
          </Field>
          <Field label="ІПН" htmlFor="pe-payout-tax" hint="10 цифр. Ми зберігаємо його зашифрованим.">
            <Input id="pe-payout-tax" autoComplete="off" inputMode="numeric" value={fields.taxId} maxLength={12} className="tabular-nums" onChange={(event) => form.setField("taxId", event.target.value)} onKeyDown={onEnter} />
          </Field>
          <CheckboxField id="pe-payout-account" checked={fields.accountConfirmed} onCheckedChange={(value) => form.setField("accountConfirmed", value === true)} label="Рахунок цього ФОП відкрито в monobank" />
          <CheckboxField
            id="pe-payout-consent"
            checked={fields.consent}
            onCheckedChange={(value) => form.setField("consent", value === true)}
            label={
              <>
                Погоджуюся з{" "}
                <a href={OFFER_PATH} target="_blank" rel="noreferrer" className="auth-link">
                  офертою безпечної угоди
                </a>
              </>
            }
          />
          {form.error && (
            <p role="alert" className="auth-error">
              {form.error}
            </p>
          )}
          <Button disabled={form.busy} onClick={() => void form.submit()} className="w-auto px-5">
            {form.busy && <Loader2 className="size-4 animate-spin" />}
            Подати заявку
          </Button>
        </div>
      )}
    </section>
  );
};
