"use client";

// components/admin/use-payout-verify.ts
//
// «Перевірити в банку» для заявки на виплати: запит до API, стан кнопки й текст помилки.

import { useRouter } from "next/navigation";
import { useState } from "react";

export const usePayoutVerify = (userId: string) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/payouts/${encodeURIComponent(userId)}/verify`, { method: "POST" });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
        setError(problem?.detail ?? "Не вдалося перевірити.");
        return;
      }
      router.refresh();
    } catch {
      setError("Немає зв'язку з сервером.");
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, verify };
};
