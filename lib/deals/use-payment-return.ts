"use client";

// lib/deals/use-payment-return.ts
//
// Повернення зі сторінки оплати банку: Monobank веде назад на `/?open=inbox&paid=<id угоди>`. Читаємо
// параметр, прибираємо його з адреси й кілька разів питаємо сервер про стан платежу (він перепитує банк),
// поки не буде фінального статусу. Етап стане «в роботі» лише коли банк підтвердив холд.

import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { createStore, useStore } from "@/lib/store";
import { checkPayment } from "./client";

export type PaymentReturn = { dealId: string; state: "checking" | "held" | "failed" | "pending" };

export const paymentReturnStore = createStore<PaymentReturn | null>(null);
const dealIdStore = createStore<string | null>(null);

const ATTEMPTS = 6;
const PAUSE_MS = 2500;
const FAILED = new Set(["failure", "expired", "reversed"]);
const HELD = new Set(["hold", "success"]);

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const takeDealId = (): string | null => {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("paid");
  if (!id) return null;
  url.searchParams.delete("paid");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return id;
};

/** Монтується один раз поруч із DealSync: обробляє повернення з банку. */
export const PaymentReturnSync = () => {
  const session = useStore(sessionStore);
  const dealId = useStore(dealIdStore);

  useEffect(() => {
    const id = takeDealId();
    if (!id) return;
    dealIdStore.set(id);
    paymentReturnStore.set({ dealId: id, state: "checking" });
  }, []);

  useEffect(() => {
    if (!dealId || session.status !== "user") return;
    let cancelled = false;
    const run = async () => {
      for (let attempt = 0; attempt < ATTEMPTS && !cancelled; attempt += 1) {
        if (attempt > 0) await wait(PAUSE_MS);
        try {
          const { status } = await checkPayment(dealId);
          if (cancelled) return;
          if (status && HELD.has(status)) return paymentReturnStore.set({ dealId, state: "held" });
          if (status && FAILED.has(status)) return paymentReturnStore.set({ dealId, state: "failed" });
        } catch {
          // Банк чи мережа мовчать: пробуємо ще; після останньої спроби скажемо «ще обробляється».
        }
      }
      if (!cancelled) paymentReturnStore.set({ dealId, state: "pending" });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [dealId, session.status]);
  return null;
};
