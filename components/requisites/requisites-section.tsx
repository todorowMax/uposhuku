"use client";

// components/requisites/requisites-section.tsx
//
// Розділ кабінету виконавця «Реквізити для прямого переказу». Стани: завантаження, помилка з повтором,
// порожньо (форма), збережено (маска й кнопка «Змінити»), чекає зміна (дата вступу). Форма відкривається на екрані. Логіка в хуку.

import { useState } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
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
  // Форма живе на екрані: відкриває її кнопка, закриває «←» (без збереження) або успішне збереження.
  const [open, setOpen] = useState(false);
  const openForm = () => {
    form.startEditing();
    setOpen(true);
  };
  const closeForm = () => {
    form.cancelEditing();
    setOpen(false);
  };
  // Підтвердження гаманця живе в зоні «Крипта» збережених способів, не окремим блоком.
  const cryptoZone =
    own?.wallet && walletConfig && (own.requisites || own.pending) ? (
      <WalletAddressSection config={walletConfig} current={own.requisites?.walletAddress} pending={own.pending?.requisites.walletAddress} onDone={() => void form.reload()} />
    ) : null;

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

      {form.load === "ready" && own && (
        <div className="grid gap-2">
          <div className="text-xs leading-snug">
            {own.requisites && <SavedMethods requisites={own.requisites} mask={own.mask} crypto={cryptoZone} />}
          </div>
          {own.pending && (
            <p className="pe-notice" role="status">
              Нові способи оплати ({own.pending.mask}) набудуть чинності {WHEN.format(own.pending.effectiveAt)}. До того діють попередні.
            </p>
          )}
          <Button variant="secondary" onClick={openForm} className="w-auto">
            {own.requisites || own.pending ? "Змінити способи оплати" : "Додати способи оплати"}
          </Button>
        </div>
      )}

      <Screen
        open={open && form.editing}
        onOpenChange={(next) => !next && closeForm()}
        title="Способи оплати"
        desktop="dialog"
        footer={
          <div className="grid gap-2">
            {error && (
              <p role="alert" className="auth-error">
                {error}
              </p>
            )}
            <Button disabled={busy} onClick={() => void form.save()} className="w-full">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Зберегти
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <MethodsForm form={form} crypto={own?.crypto ?? false} foreign={own?.foreign ?? false} />
          {own?.requisites && !own.pending && (
            <p className="pe-hint">Зміна набуде чинності через 24 години, а на пошту прийде лист: так ніхто не підмінить рахунок непомітно. Відкриті угоди лишаються зі старими реквізитами.</p>
          )}
        </div>
      </Screen>

      {notice && (
        <p role="status" className="pe-notice">
          {notice}
        </p>
      )}
    </section>
  );
};
