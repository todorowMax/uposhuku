"use client";

// components/requisites/requisites-section.tsx
//
// Розділ кабінету виконавця «Реквізити для прямого переказу». Стани: завантаження, помилка з повтором,
// порожньо (форма), збережено (маска й кнопка «Змінити»), чекає зміна (дата вступу). Логіка в хуку.

import type { KeyboardEvent } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { WalletAddressSection } from "@/components/wallet/wallet-address-section";
import { useCryptoConfig } from "@/components/wallet/use-crypto-config";
import { PAY_URL_HOSTS } from "@/lib/deals/requisites";
import { useRequisitesForm } from "./use-requisites-form";

const WHEN = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const RequisitesSection = () => {
  const form = useRequisitesForm();
  const walletConfig = useCryptoConfig();
  const { own, fields, busy, error, notice } = form;
  const onEnter = (event: KeyboardEvent) => {
    // Розділ стоїть усередині форми профілю: Enter не має зберігати профіль.
    if (event.key !== "Enter") return;
    event.preventDefault();
    void form.save();
  };

  return (
    <section className="pe-section" aria-labelledby="pe-requisites">
      <h2 id="pe-requisites" className="pe-title">
        Реквізити для прямого переказу
      </h2>
      <p className="pe-hint -mt-1">
        Їх побачить замовник після прийняття угоди з прямим переказом. Ми зберігаємо їх зашифрованими. Номер картки не приймаємо: потрібен IBAN рахунку.
      </p>

      {form.load === "loading" && (
        <div role="status" className="pe-hint flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Завантажуємо реквізити…
        </div>
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

      {form.load === "ready" && !form.editing && own && (
        <div className="grid gap-2">
          <dl className="text-xs leading-snug">
            <dt className="text-ink-muted">Рахунок</dt>
            <dd className="font-medium tabular-nums text-ink">{own.mask}</dd>
            {own.requisites?.usdtTrc20 && (
              <>
                <dt className="mt-1.5 text-ink-muted">USDT (TRC-20)</dt>
                <dd className="break-all font-medium tabular-nums text-ink">{own.requisites.usdtTrc20}</dd>
              </>
            )}
            {own.requisites?.binanceId && (
              <>
                <dt className="mt-1.5 text-ink-muted">Binance ID</dt>
                <dd className="font-medium tabular-nums text-ink">{own.requisites.binanceId}</dd>
              </>
            )}
          </dl>
          {own.pending && (
            <p className="pe-notice" role="status">
              Нові реквізити ({own.pending.mask}) набудуть чинності {WHEN.format(own.pending.effectiveAt)}. До того діють попередні.
            </p>
          )}
          <Button variant="secondary" onClick={form.startEditing} className="w-auto">
            Змінити реквізити
          </Button>
        </div>
      )}

      {form.load === "ready" && form.editing && (
        <div className="grid gap-3">
          <Field label="Одержувач" htmlFor="pe-req-recipient" hint="Як у банку: ПІБ або назва ФОП.">
            <Input id="pe-req-recipient" autoComplete="name" value={fields.recipient} maxLength={100} onChange={(event) => form.setField("recipient", event.target.value)} onKeyDown={onEnter} />
          </Field>
          <Field label="IBAN" htmlFor="pe-req-iban" hint="Український, 29 символів, починається з UA.">
            <Input id="pe-req-iban" autoComplete="off" inputMode="text" value={fields.iban} maxLength={40} className="tabular-nums" onChange={(event) => form.setField("iban", event.target.value)} onKeyDown={onEnter} />
          </Field>
          <Field label="Код РНОКПП або ЄДРПОУ" htmlFor="pe-req-tax" hint="10 цифр для людини, 8 для ФОП чи юрособи.">
            <Input id="pe-req-tax" autoComplete="off" inputMode="numeric" value={fields.taxCode} maxLength={12} className="tabular-nums" onChange={(event) => form.setField("taxCode", event.target.value)} onKeyDown={onEnter} />
          </Field>
          <Field label="Посилання на оплату" htmlFor="pe-req-url" optional hint={`Лише https і лише ${PAY_URL_HOSTS.join(", ")}.`}>
            <Input id="pe-req-url" type="url" autoComplete="off" value={fields.payUrl} maxLength={500} onChange={(event) => form.setField("payUrl", event.target.value)} onKeyDown={onEnter} />
          </Field>
          {own?.crypto && (
            <>
              <Field label="Адреса USDT (TRC-20)" htmlFor="pe-req-usdt" optional hint="Лише мережа TRON (TRC-20), 34 символи, починається з T. Надсилання в іншу мережу втрачає гроші.">
                <Input id="pe-req-usdt" autoComplete="off" spellCheck={false} value={fields.usdtTrc20} maxLength={40} className="tabular-nums" onChange={(event) => form.setField("usdtTrc20", event.target.value)} onKeyDown={onEnter} />
              </Field>
              <Field label="Binance ID" htmlFor="pe-req-binance" optional hint="Цифри. Оплату на Binance ID сайт перевірити не може: ви підтверджуєте її самі.">
                <Input id="pe-req-binance" autoComplete="off" inputMode="numeric" value={fields.binanceId} maxLength={15} className="tabular-nums" onChange={(event) => form.setField("binanceId", event.target.value)} onKeyDown={onEnter} />
              </Field>
            </>
          )}
          {own?.requisites && !own.pending && (
            <p className="pe-hint">Зміна набуде чинності через 24 години, а на пошту прийде лист: так ніхто не підмінить рахунок непомітно. Відкриті угоди лишаються зі старими реквізитами.</p>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button disabled={busy} onClick={() => void form.save()} className="w-auto px-5">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Зберегти реквізити
            </Button>
            {(own?.requisites || own?.pending) && (
              <Button variant="secondary" disabled={busy} onClick={form.cancelEditing} className="w-auto">
                Скасувати
              </Button>
            )}
          </div>
        </div>
      )}

      {form.load === "ready" && !form.editing && own?.wallet && walletConfig && (own.requisites || own.pending) && (
        <WalletAddressSection config={walletConfig} current={own.requisites?.walletAddress} pending={own.pending?.requisites.walletAddress} onDone={() => void form.reload()} />
      )}

      {notice && (
        <p role="status" className="pe-notice">
          {notice}
        </p>
      )}
    </section>
  );
};
