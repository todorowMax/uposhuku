"use client";

// components/admin/use-payout-reject.ts
//
// Відхилення заявки чи відключення активного рахунку: причина, запит до API, стан кнопки й помилка.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkRejectReason } from "@/lib/deals/payout";

export const usePayoutReject = (userId: string) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const checked = checkRejectReason(reason);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/payouts/${encodeURIComponent(userId)}/reject`, { method: "POST", body: JSON.stringify({ reason: checked.reason }) });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
        setError(problem?.detail ?? "Не вдалося зберегти.");
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Немає зв'язку з сервером.");
    } finally {
      setBusy(false);
    }
  };

  return { open, setOpen, reason, setReason, busy, error, submit };
};
