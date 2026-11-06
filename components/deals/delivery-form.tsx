"use client";

// components/deals/delivery-form.tsx
//
// «Здати етап» з необов'язковим результатом: пояснення (до 1000 символів) і посилання https. Кнопка працює й
// з порожніми полями. Те, що виконавець додав, побачать замовник при прийманні й модератор.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { DELIVERY_LINK_MAX, DELIVERY_TEXT_MAX } from "@/lib/deals/dispute-aids";
import { useDeliveryForm } from "./use-delivery-form";

export const DeliveryForm = ({ dealId, busy, onSubmit }: { dealId: string; busy: boolean; onSubmit: (fields: { deliveryText: string; deliveryLink: string }) => Promise<void> }) => {
  const form = useDeliveryForm(onSubmit);
  return (
    <div className="grid gap-2">
      <Field label="Що зроблено" optional htmlFor={`delivery-text-${dealId}`} hint="Коротко: що ви передаєте. Це побачить замовник і, якщо буде спір, модератор.">
        <Textarea id={`delivery-text-${dealId}`} rows={2} value={form.text} maxLength={DELIVERY_TEXT_MAX} onChange={(event) => form.setText(event.target.value)} />
      </Field>
      <Field label="Посилання на результат" optional htmlFor={`delivery-link-${dealId}`} hint="Лише https://…">
        <Input id={`delivery-link-${dealId}`} type="url" inputMode="url" value={form.link} maxLength={DELIVERY_LINK_MAX} onChange={(event) => form.setLink(event.target.value)} placeholder="https://" />
      </Field>
      {form.error && (
        <p role="alert" className="auth-error">
          {form.error}
        </p>
      )}
      <Button disabled={busy} onClick={() => void form.submit()} className="w-auto px-4">
        {busy && <Loader2 className="size-4 animate-spin" />}
        Здати етап
      </Button>
    </div>
  );
};
