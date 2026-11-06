"use client";

// components/deals/deal-screen/parts/delivery-screen.tsx
//
// «Здати етап» на екрані: пояснення (до 1000 символів) і посилання https, обидва необов'язкові. Унизу кнопка здачі.
// Те, що виконавець додав, побачать замовник при прийманні й модератор.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Screen } from "@/components/ui/screen";
import { useDeliveryForm } from "@/components/deals/use-delivery-form";
import { DELIVERY_LINK_MAX, DELIVERY_TEXT_MAX } from "@/lib/deals/dispute-aids";

export const DeliveryScreen = ({ dealId, busy, onOpenChange, onSubmit }: { dealId: string; busy: boolean; onOpenChange: (open: boolean) => void; onSubmit: (fields: { deliveryText: string; deliveryLink: string }) => Promise<void> }) => {
  const form = useDeliveryForm(onSubmit);
  return (
    <Screen
      open
      onOpenChange={onOpenChange}
      title="Здати етап"
      desktop="panel"
      footer={
        <Button variant="offer" disabled={busy} onClick={() => void form.submit()} className="w-full">
          {busy && <Loader2 className="size-4 animate-spin" />}
          Здати етап
        </Button>
      }
    >
      <div className="deal">
        <Field label="Що зроблено" optional htmlFor={`delivery-text-${dealId}`} hint="Коротко: що ви передаєте. Це побачить замовник і, якщо буде спір, модератор.">
          <Textarea id={`delivery-text-${dealId}`} rows={3} value={form.text} maxLength={DELIVERY_TEXT_MAX} onChange={(event) => form.setText(event.target.value)} />
        </Field>
        <Field label="Посилання на результат" optional htmlFor={`delivery-link-${dealId}`} hint="Лише https://…">
          <Input id={`delivery-link-${dealId}`} type="url" inputMode="url" value={form.link} maxLength={DELIVERY_LINK_MAX} onChange={(event) => form.setLink(event.target.value)} placeholder="https://" />
        </Field>
        {form.error && (
          <p role="alert" className="auth-error">
            {form.error}
          </p>
        )}
      </div>
    </Screen>
  );
};
