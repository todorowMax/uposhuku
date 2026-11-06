"use client";

// components/deals/complaint-box.tsx
//
// «Поскаржитися» в прямій угоді. У тексті прямо: прямий переказ ми повернути не можемо, скарга не змінює ні
// гроші, ні статус етапу. Друга сторона побачить лише службовий рядок у розмові.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { COMPLAINT_NOTE, COMPLAINT_REASON_LABEL, COMPLAINT_REASONS, COMPLAINT_TEXT_MAX } from "@/lib/deals/complaints";
import { useComplaint } from "./use-complaint";

export const ComplaintBox = ({ dealId, stageId }: { dealId: string; stageId: string }) => {
  const form = useComplaint(dealId, stageId);
  if (form.sent) {
    return (
      <p role="status" className="deal-note">
        Скаргу подано. Прямий переказ ми повернути не можемо; модератор побачить її разом з листуванням.
      </p>
    );
  }
  if (!form.open) {
    return (
      <Button variant="link" onClick={() => form.setOpen(true)} className="mt-2 w-fit text-sm">
        Поскаржитися
      </Button>
    );
  }
  return (
    <div className="deal-box mt-2 grid gap-2">
      <p className="text-sm font-semibold text-ink">Скарга на угоду</p>
      <p className="pe-hint">{COMPLAINT_NOTE}</p>
      <RadioGroup value={form.reason} onValueChange={form.setReason} aria-label="Причина скарги">
        {COMPLAINT_REASONS.map((reason) => (
          <RadioCard key={reason} id={`complaint-${dealId}-${reason}`} value={reason} title={COMPLAINT_REASON_LABEL[reason]} />
        ))}
      </RadioGroup>
      <Field label="Що сталося" htmlFor={`complaint-text-${dealId}`}>
        <Textarea id={`complaint-text-${dealId}`} rows={3} value={form.text} maxLength={COMPLAINT_TEXT_MAX} onChange={(event) => form.setText(event.target.value)} />
      </Field>
      {form.error && (
        <p role="alert" className="auth-error">
          {form.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={form.busy} onClick={() => void form.submit()} className="w-auto px-4">
          {form.busy && <Loader2 className="size-4 animate-spin" />}
          Надіслати скаргу
        </Button>
        <Button variant="secondary" disabled={form.busy} onClick={() => form.setOpen(false)} className="w-auto px-4">
          Скасувати
        </Button>
      </div>
    </div>
  );
};
