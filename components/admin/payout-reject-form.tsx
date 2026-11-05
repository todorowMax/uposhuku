"use client";

// «Відхилити» заявку чи «Відключити» активний рахунок виконавця з обов'язковою причиною, яку побачить виконавець.

import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { REJECT_REASON_MAX } from "@/lib/deals/payout";
import { usePayoutReject } from "./use-payout-reject";

export const PayoutRejectForm = ({ userId, active }: { userId: string; active: boolean }) => {
  const form = usePayoutReject(userId);
  const label = active ? "Відключити виплати" : "Відхилити заявку";
  if (!form.open) {
    return (
      <Button variant="secondary" onClick={() => form.setOpen(true)} className="mt-2 w-auto px-4">
        {label}
      </Button>
    );
  }
  return (
    <div className="mt-2 grid gap-2">
      <Field label="Причина для виконавця" htmlFor={`reject-${userId}`} hint="Виконавець побачить її й зможе подати заявку знову.">
        <Textarea id={`reject-${userId}`} value={form.reason} maxLength={REJECT_REASON_MAX} onChange={(event) => form.setReason(event.target.value)} />
      </Field>
      {form.error && (
        <p role="alert" className="auth-error">
          {form.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={form.busy} onClick={() => void form.submit()} className="w-auto px-4">
          {form.busy && <Loader2 className="size-4 animate-spin" />}
          {label}
        </Button>
        <Button variant="secondary" disabled={form.busy} onClick={() => form.setOpen(false)} className="w-auto px-4">
          Скасувати
        </Button>
      </div>
    </div>
  );
};
