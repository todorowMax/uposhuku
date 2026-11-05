"use client";

// lib/deals/use-safe-deal.ts
//
// Чи доступна безпечна угода цій людині. Рішення на сервері (режим і список пошт), тут лише читаємо його
// один раз за сторінку. Поки відповіді немає або вона помилкова, безпечної угоди для людини немає.

import { useEffect, useState } from "react";
import { callApi } from "./client";

let cached: Promise<boolean> | null = null;

const load = (): Promise<boolean> => {
  cached ??= callApi<{ safeDeal: boolean }>("/api/deals/config")
    .then((config) => config.safeDeal === true)
    .catch(() => {
      cached = null;
      return false;
    });
  return cached;
};

export const useSafeDeal = (): boolean => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void load().then((value) => !cancelled && setEnabled(value));
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
};
