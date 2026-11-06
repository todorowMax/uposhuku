"use client";

// lib/deals/use-safe-deal.ts
//
// Чи доступна безпечна угода цій людині й цьому виконавцю. Рішення на сервері (режим і список пошт,
// підключені виплати виконавця), тут лише читаємо його. Поки відповіді немає або вона помилкова,
// безпечної угоди немає.

import { useEffect, useState } from "react";
import { callApi } from "./client";

export interface SafeDealOptions {
  /** Відповідь сервера вже є. */
  ready: boolean;
  /** Режим і список пошт дозволяють безпечну угоду цій людині. */
  safeEnabled: boolean;
  /** Виконавець підключив виплати: без цього безпечна угода з ним неможлива. */
  fop: boolean;
}

interface Config {
  safeDeal: boolean;
  performerPayouts?: boolean;
}

const cache = new Map<string, Promise<Config | null>>();

const load = (performerId: string | null): Promise<Config | null> => {
  const key = performerId ?? "";
  const known = cache.get(key);
  if (known) return known;
  const query = performerId ? `?performer=${encodeURIComponent(performerId)}` : "";
  const request = callApi<Config>(`/api/deals/config${query}`)
    .then((config) => config)
    .catch(() => {
      cache.delete(key);
      return null;
    });
  cache.set(key, request);
  return request;
};

export const useSafeDealOptions = (performerId: string | null): SafeDealOptions => {
  const [state, setState] = useState<SafeDealOptions>({ ready: false, safeEnabled: false, fop: false });
  useEffect(() => {
    let cancelled = false;
    void load(performerId).then((config) => {
      if (cancelled) return;
      setState({
        ready: true,
        safeEnabled: config?.safeDeal === true,
        fop: config?.performerPayouts === true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [performerId]);
  return state;
};
