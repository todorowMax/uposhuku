"use client";

// components/requisites/requisites-section.tsx
//
// Розділ кабінету виконавця «Реквізити для прямого переказу». Стани: завантаження, помилка з повтором,
// порожньо (форма), збережено (маска й кнопка «Змінити»), чекає зміна (дата вступу). Логіка в хуку.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { WalletAddressSection } from "@/components/wallet/wallet-address-section";
import { useCryptoConfig } from "@/components/wallet/use-crypto-config";
import { MethodsForm } from "./methods-form";
import { SavedMethods } from "./saved-methods";
import { useRequisitesForm } from "./use-requisites-form";

const WHEN = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const RequisitesSection = () => {
  const form = useRequisitesForm();
  const walletConfig = useCryptoConfig();
  const { own, busy, error, notice } = form;

  return (
    <section className="pe-section" aria-labelledby="pe-requisites">
      <h2 id="pe-requisites" className="pe-title">
        Як отримувати оплату
      </h2>
      <p className="pe-hint -mt-1">
        Увімкніть способи, якими ви приймаєте гроші: потрібен хоча б один. Замовник побачить лише їх, після прийняття угоди з прямим переказом. Ми зберігаємо їх зашифрованими. Виплати безпечної угоди налаштовуються окремо, у своєму розділі: це інша форма.
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
            {own.requisites && <SavedMethods requisites={own.requisites} mask={own.mask} />}
          </dl>
          {own.pending && (
            <p className="pe-notice" role="status">
              Нові способи оплати ({own.pending.mask}) набудуть чинності {WHEN.format(own.pending.effectiveAt)}. До того діють попередні.
            </p>
          )}
          <Button variant="secondary" onClick={form.startEditing} className="w-auto">
            Змінити способи оплати
          </Button>
        </div>
      )}

      {form.load === "ready" && form.editing && (
        <div className="grid gap-3">
          <MethodsForm form={form} crypto={own?.crypto ?? false} foreign={own?.foreign ?? false} />
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
              Зберегти
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
