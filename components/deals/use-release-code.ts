"use client";

// components/deals/use-release-code.ts
//
// Логіка підтвердження приймання етапу кодом з пошти: надіслати код, ввести, підтвердити.

import { useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { requestReleaseCode } from "@/lib/deals/client";

export const useReleaseCode = (dealId: string, onConfirm: (code: string) => Promise<boolean>) => {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await requestReleaseCode(dealId);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося надіслати код.");
    } finally {
      setSending(false);
    }
  };

  const confirm = async () => {
    if (!/^\d{4,8}$/.test(code.trim())) return setError("Введіть код з листа.");
    setError(null);
    await onConfirm(code.trim());
  };

  return { sent, sending, code, error, setCode: (value: string) => setCode(value.replace(/\D/g, "").slice(0, 8)), send, confirm };
};
