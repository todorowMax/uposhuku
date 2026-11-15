"use client";

import { useState } from "react";
import { ApiError, renewActiveRequest } from "@/lib/auth/client";

/** «Так, ще актуально» з кнопки: признак роботи й читабельна помилка сервера. */
export const useRenewRequest = () => {
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renew = async (id: string) => {
    setRenewing(true);
    setError(null);
    try {
      await renewActiveRequest(id);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося продовжити запит.");
    } finally {
      setRenewing(false);
    }
  };

  return { renewing, error, renew };
};
