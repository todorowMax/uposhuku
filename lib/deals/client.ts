"use client";

// lib/deals/client.ts
//
// Угоди в браузері: стан за запитами, опитування (поки немає WebSocket),
// дії замовника. Стани й правила — у lib/deals/machine.ts.

import { useEffect } from "react";
import { ApiError } from "@/lib/auth/client";
import { createStore, useStore } from "@/lib/store";
import { useActiveRequest } from "@/lib/requests/offers";
import type { Deal, DealAction, DealDraft } from "./types";

/** Угоди за id запиту. */
export const dealsStore = createStore<Record<string, Deal[]>>({});

const POLL_MS = 3000;

const call = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      cache: "no-store",
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiError("Немає зв'язку. Перевірте інтернет і спробуйте ще раз.");
  }
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string }) | null;
  if (!response.ok) throw new ApiError(data?.detail ?? data?.title ?? "Щось пішло не так. Спробуйте ще раз.");
  return data as T;
};

const put = (requestId: string, deals: Deal[]) => dealsStore.set({ ...dealsStore.get(), [requestId]: deals });

export const loadDeals = async (requestId: string) => {
  try {
    const { deals } = await call<{ deals: Deal[] }>(`/api/deals?requestId=${encodeURIComponent(requestId)}`);
    put(requestId, deals);
  } catch {
    // Мережа моргнула: лишаємо, що було.
  }
};

/** Оновити одну угоду в сховищі після дії. */
const replace = (deal: Deal) => {
  const current = dealsStore.get()[deal.requestId] ?? [];
  put(deal.requestId, current.some((item) => item.id === deal.id) ? current.map((item) => (item.id === deal.id ? deal : item)) : [deal, ...current]);
};

export const proposeDeal = async (draft: DealDraft) => {
  const { deal } = await call<{ deal: Deal }>("/api/deals", { method: "POST", body: JSON.stringify(draft) });
  replace(deal);
  return deal;
};

export const dealAction = async (deal: Deal, action: DealAction, stageId?: string, simulate?: "declined") => {
  const { deal: next } = await call<{ deal: Deal }>(`/api/deals/${encodeURIComponent(deal.id)}`, {
    method: "POST",
    body: JSON.stringify({ action, stageId, simulate }),
  });
  replace(next);
  return next;
};

/**
 * Тримає угоди активного запиту свіжими: виконавець у заглушці відповідає
 * за таймером, і картка запиту, вкладка чату й підказки мають це бачити
 * без перезавантаження. Монтується один раз на сторінці.
 */
export function DealSync() {
  const request = useActiveRequest();
  const id = request?.status === "open" ? request.id : null;
  useEffect(() => {
    if (!id) return;
    void loadDeals(id);
    const timer = window.setInterval(() => void loadDeals(id), POLL_MS);
    return () => window.clearInterval(timer);
  }, [id]);
  return null;
}

const EMPTY: Deal[] = [];
export const useDeals = (requestId: string | null | undefined): Deal[] => {
  const all = useStore(dealsStore);
  return (requestId ? all[requestId] : undefined) ?? EMPTY;
};
