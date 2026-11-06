"use client";

// components/wallet/use-escrow-info.ts
//
// Дані ескроу для картки угоди: мережа, адреси контрактів і підтверджена адреса гаманця виконавця. Тут немає ні wagmi,
// ні viem: хук безпечно підключати в загальному пакеті. Помилка не ховається, а показується з повтором.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { fetchEscrowInfo, type EscrowInfoDto } from "@/lib/crypto/client";

export const useEscrowInfo = (dealId: string) => {
  const [info, setInfo] = useState<EscrowInfoDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchEscrowInfo(dealId)
      .then((value) => {
        if (cancelled) return;
        setInfo(value);
        setError(null);
      })
      .catch((reason: unknown) => !cancelled && setError(reason instanceof ApiError ? reason.message : "Не вдалося завантажити дані ескроу."));
    return () => {
      cancelled = true;
    };
  }, [dealId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { info, error, retry };
};
