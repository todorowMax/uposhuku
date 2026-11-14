"use client";

import { useEffect, useState } from "react";
import { ApiError, reopenActiveRequest } from "@/lib/auth/client";

/** Хвилина: з такою частотою перераховуємо «ще N год», бо точність потрібна до години. */
const TICK_MS = 60_000;

/** Поточний час для підписів «ще N год»; оновлюється раз на хвилину. */
export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
};

/** Відновлення запиту з кнопки: id запиту, що відновлюється, і читабельна помилка сервера (404, 409, 429). */
export const useRestoreRequest = () => {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restore = async (id: string): Promise<boolean> => {
    setRestoringId(id);
    setError(null);
    try {
      await reopenActiveRequest(id);
      return true;
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося відновити запит.");
      return false;
    } finally {
      setRestoringId(null);
    }
  };

  return { restoringId, error, restore };
};
