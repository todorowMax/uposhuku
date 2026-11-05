"use client";

// components/deals/release-code-box.tsx
//
// Приймання етапу від 10 000 ₴: виплата необоротна, тому перед нею код з пошти замовника. Дві дії: надіслати код,
// ввести його й підтвердити. Помилки сервера (невірний, застарілий код) показуємо поруч із полем.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useReleaseCode } from "./use-release-code";

export const ReleaseCodeBox = ({ dealId, amount, busy, onConfirm, onCancel }: { dealId: string; amount: string; busy: boolean; onConfirm: (code: string) => Promise<boolean>; onCancel: () => void }) => {
  const form = useReleaseCode(dealId, onConfirm);
  return (
    <div className="deal-box grid gap-2">
      <p className="text-sm text-ink">Виплатити {amount} виконавцю? Скасувати це не вийде. Для великих сум підтверджуємо кодом, який надішлемо на вашу пошту.</p>
      {!form.sent ? (
        <Button variant="offer" disabled={form.sending} onClick={() => void form.send()}>
          {form.sending && <Loader2 className="size-4 animate-spin" />}
          Надіслати код на пошту
        </Button>
      ) : (
        <>
          <Field label="Код з листа" htmlFor={`release-code-${dealId}`} hint="Діє 10 хвилин.">
            <Input id={`release-code-${dealId}`} inputMode="numeric" autoComplete="one-time-code" value={form.code} onChange={(event) => form.setCode(event.target.value)} className="tabular-nums" />
          </Field>
          <Button variant="offer" disabled={busy} onClick={() => void form.confirm()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Підтвердити й виплатити
          </Button>
          <Button variant="link" disabled={form.sending} onClick={() => void form.send()} className="text-xs">
            Надіслати код ще раз
          </Button>
        </>
      )}
      {form.error && (
        <p role="alert" className="auth-error">
          {form.error}
        </p>
      )}
      <Button variant="secondary" onClick={onCancel} className="w-auto">
        Назад
      </Button>
    </div>
  );
};
