"use client";

// lib/placement/client.ts
//
// Розміщення в браузері: скільки сплачено й який рівень, відкрита панель
// «Стати на карту», оплата. Рівень одразу міняє маркер людини на карті.

import { ApiError, sessionStore } from "@/lib/auth/client";
import { updateMyPerformer } from "@/lib/map/performers";
import { createStore } from "@/lib/store";
import type { PaymentOutcome, Placement } from "./types";

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
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string }) | null;
  if (!response.ok) throw new ApiError(data?.detail ?? data?.title ?? "Щось пішло не так. Спробуйте ще раз.");
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

/** Оплатити. Рівень на карті міняється одразу після успіху. */
export const payForPlacement = async (amount: number, simulate?: PaymentOutcome): Promise<Placement> => {
  const { placement } = await call<{ placement: Placement }>("/api/placement", {
    method: "POST",
    body: JSON.stringify({ amount, simulate: simulate === "declined" ? "declined" : undefined }),
  });
  placementStore.set(placement);
  updateMyPerformer({ tier: placement.tier });
  tierUpStore.set({ tier: placement.tier, at: Date.now() });
  return placement;
};

export const forgetPlacement = () => {
  placementStore.set(null);
  placementOpenStore.set(false);
};
