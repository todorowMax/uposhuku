"use client";

// lib/placement/client.ts
//
// Розміщення в браузері: скільки сплачено й який рівень, відкрита панель
// «Стати на карту», рахунок на оплату й перевірка його стану. Рівень одразу міняє маркер людини на карті; без оплати маркера на карті немає.

import { ApiError, problemError, sessionStore } from "@/lib/auth/client";
import { createStore } from "@/lib/store";
import type { InvoiceCheck, Placement, PlacementInvoice } from "./types";

export const placementStore = createStore<Placement | null>(null);
/** Панель «Стати на карту» відкрита. */
export const placementOpenStore = createStore(false);
/** Просять карту підсвітити щойно підвищений маркер. */
export const tierUpStore = createStore<{ tier: number; at: number } | null>(null);

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
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string; code?: string }) | null;
  if (!response.ok) throw problemError(data);
  return data as T;
};

export const loadPlacement = async () => {
  if (sessionStore.get().status !== "user") return null;
  try {
    const { placement } = await call<{ placement: Placement }>("/api/placement");
    placementStore.set(placement);
    return placement;
  } catch {
    return null;
  }
};

/** Створює рахунок у Monobank. Далі людину ведемо на `pageUrl`, а рівень міняється, коли банк підтвердить оплату. */
export const startPlacementPayment = (amount: number): Promise<PlacementInvoice> =>
  call<PlacementInvoice>("/api/placement", { method: "POST", body: JSON.stringify({ amount }) });

/** Стан рахунку; поки він не фінальний, сервер сам звіряється з банком. */
export const checkPlacementInvoice = (id: string): Promise<InvoiceCheck> => call<InvoiceCheck>(`/api/placement/invoices/${encodeURIComponent(id)}`);

/** Оплату зараховано: оновлюємо рівень у сховищі й маркер на карті. */
export const settlePlacement = async (placement: Placement): Promise<void> => {
  placementStore.set(placement);
  // Динамічний імпорт: профіль уже імпортує розміщення, цикл статично не склеїти.
  const { syncMyMarker } = await import("@/lib/profile/client");
  await syncMyMarker();
  tierUpStore.set({ tier: placement.tier, at: Date.now() });
};

export const forgetPlacement = () => {
  placementStore.set(null);
  placementOpenStore.set(false);
};
