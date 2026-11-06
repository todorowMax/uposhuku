"use client";

// components/requisites/methods-form.tsx
//
// Поля способів оплати виконавця, по зонах: «Банк», «Крипта», «Закордонні сервіси». Зони, недоступні за
// прапорцями, не показуємо. Стан і збереження в хуку (use-requisites-form.ts).

import type { KeyboardEvent, ReactNode } from "react";
import { Field, Input } from "@/components/ui/input";
import { PAY_URL_HOSTS } from "@/lib/deals/requisites";
import { MethodCard } from "./method-card";
import type { useRequisitesForm } from "./use-requisites-form";

type Form = ReturnType<typeof useRequisitesForm>;

const Zone = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="grid gap-2">
    <legend className="text-sm font-semibold text-ink">{title}</legend>
    {children}
  </fieldset>
);

export const MethodsForm = ({ form, crypto, foreign }: { form: Form; crypto: boolean; foreign: boolean }) => {
  const { fields, enabled, errors } = form;
  const onEnter = (event: KeyboardEvent) => {
    // Розділ стоїть усередині форми профілю: Enter не має зберігати профіль.
    if (event.key !== "Enter") return;
    event.preventDefault();
    void form.save();
  };
  const input = (name: keyof typeof fields) => ({ value: fields[name], onChange: (event: { target: { value: string } }) => form.setField(name, event.target.value), onKeyDown: onEnter });

  return (
    <div className="grid gap-4">
      <Zone title="Банк">
        <MethodCard id="pe-m-bank" title="Банківський переказ" hint="IBAN, одержувач і код: усе разом." on={enabled.bank} onChange={(on) => form.setMethod("bank", on)}>
          <Field label="Одержувач" htmlFor="pe-req-recipient" hint="Як у банку: ПІБ або назва ФОП." error={errors.recipient}>
            <Input id="pe-req-recipient" autoComplete="name" maxLength={100} {...input("recipient")} />
          </Field>
          <Field label="IBAN" htmlFor="pe-req-iban" hint="Український, 29 символів, починається з UA. Номер картки не приймаємо." error={errors.iban}>
            <Input id="pe-req-iban" autoComplete="off" inputMode="text" maxLength={40} className="tabular-nums" {...input("iban")} />
          </Field>
          <Field label="Код РНОКПП або ЄДРПОУ" htmlFor="pe-req-tax" hint="10 цифр для людини, 8 для ФОП чи юрособи." error={errors.taxCode}>
            <Input id="pe-req-tax" autoComplete="off" inputMode="numeric" maxLength={12} className="tabular-nums" {...input("taxCode")} />
          </Field>
          <Field label="Посилання банку на оплату" htmlFor="pe-req-url" optional hint={`Лише https і лише ${PAY_URL_HOSTS.join(", ")}.`} error={errors.payUrl}>
            <Input id="pe-req-url" type="url" autoComplete="off" maxLength={500} {...input("payUrl")} />
          </Field>
        </MethodCard>
      </Zone>

      {crypto && (
        <Zone title="Крипта">
          <MethodCard id="pe-m-usdt" title="USDT (TRC-20)" hint="Сайт перевіряє оплату за хешем транзакції." on={enabled.usdt} onChange={(on) => form.setMethod("usdt", on)}>
            <Field label="Адреса USDT (TRC-20)" htmlFor="pe-req-usdt" hint="Лише мережа TRON (TRC-20), 34 символи, починається з T. Надсилання в іншу мережу втрачає гроші." error={errors.usdtTrc20}>
              <Input id="pe-req-usdt" autoComplete="off" spellCheck={false} maxLength={40} className="tabular-nums" {...input("usdtTrc20")} />
            </Field>
          </MethodCard>
          <MethodCard id="pe-m-binance" title="Binance ID" hint="Сайт не бачить цей переказ: ви підтверджуєте оплату самі." on={enabled.binance} onChange={(on) => form.setMethod("binance", on)}>
            <Field label="Binance ID" htmlFor="pe-req-binance" hint="Лише цифри." error={errors.binanceId}>
              <Input id="pe-req-binance" autoComplete="off" inputMode="numeric" maxLength={15} className="tabular-nums" {...input("binanceId")} />
            </Field>
          </MethodCard>
        </Zone>
      )}

      {foreign && (
        <Zone title="Закордонні сервіси">
          <p className="pe-hint">Ці сервіси проводимо не ми. Перевірте самі, чи може ваш акаунт приймати оплату за послуги. Суму у вашій валюті сторони узгоджують у чаті.</p>
          <MethodCard id="pe-m-paypal" title="PayPal" on={enabled.paypal} onChange={(on) => form.setMethod("paypal", on)}>
            <Field label="Посилання PayPal.me" htmlFor="pe-req-paypal" hint="Приклад: https://paypal.me/ваше-імя" error={errors.paypalUrl}>
              <Input id="pe-req-paypal" type="url" autoComplete="off" maxLength={200} {...input("paypalUrl")} />
            </Field>
          </MethodCard>
          <MethodCard id="pe-m-wise" title="Wise" on={enabled.wise} onChange={(on) => form.setMethod("wise", on)}>
            <Field label="Посилання Wise" htmlFor="pe-req-wise" hint="Приклад: https://wise.com/pay/me/ваше-імя" error={errors.wiseUrl}>
              <Input id="pe-req-wise" type="url" autoComplete="off" maxLength={200} {...input("wiseUrl")} />
            </Field>
          </MethodCard>
        </Zone>
      )}
    </div>
  );
};
