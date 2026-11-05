"use client";

// components/deals/use-crypto-transfer.ts
//
// Оплата USDT TRC-20 за хешем: поле хеша, перевірка на сервері, текст помилки. Після успіху оновлюємо угоди
// запиту, щоб етап став «claimed».

import { useState } from "react";
import { submitCryptoProof } from "@/lib/crypto/client";
import { isTronTxHash } from "@/lib/crypto/tron";
import { ApiError } from "@/lib/auth/client";
import { loadDeals } from "@/lib/deals/client";

export const useCryptoTransfer = (dealId: string, requestId: string) => {
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = isTronTxHash(hash.trim());

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitCryptoProof(dealId, hash.trim());
      await loadDeals(requestId);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося перевірити транзакцію.");
    } finally {
      setBusy(false);
    }
  };

  const change = (value: string) => {
    setHash(value);
    setError(null);
  };

  return { hash, setHash: change, busy, error, ready, submit };
};
