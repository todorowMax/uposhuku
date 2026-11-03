"use client";

// Повернення з оплати: Monobank веде назад на `/?placement=<id рахунку>`. Читаємо параметр,
// прибираємо його з адреси, відкриваємо панель і питаємо сервер про стан рахунку (до 5 разів
// з паузою 2 с, поки банк не дасть фінальний статус).

import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { checkPlacementInvoice, placementOpenStore, settlePlacement } from "@/lib/placement/client";
import { createStore, useStore } from "@/lib/store";

export type PlacementReturn = "checking" | "paid" | "failed" | "pending";

const ATTEMPTS = 5;
const PAUSE_MS = 2000;
const FAILED = new Set(["failure", "expired", "reversed"]);

// Сховища, а не useState: id з адреси читаємо в ефекті, а запис у сховище не каскадує рендери.
const invoiceStore = createStore<string | null>(null);
const stateStore = createStore<PlacementReturn | null>(null);

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Один раз за відкриття сторінки: id рахунку з адреси, і параметр зникає. */
const takeInvoiceId = (): string | null => {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("placement");
  if (!id) return null;
  url.searchParams.delete("placement");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return id;
};

const dismiss = () => {
  invoiceStore.set(null);
  stateStore.set(null);
};

export const usePlacementReturn = () => {
  const session = useStore(sessionStore);
  const invoiceId = useStore(invoiceStore);
  const state = useStore(stateStore);

  useEffect(() => {
    const id = takeInvoiceId();
    if (!id) return;
    invoiceStore.set(id);
    stateStore.set("checking");
    placementOpenStore.set(true);
  }, []);

  useEffect(() => {
    if (!invoiceId || session.status !== "user") return;
    let cancelled = false;
    const run = async () => {
      for (let attempt = 0; attempt < ATTEMPTS && !cancelled; attempt += 1) {
        if (attempt > 0) await wait(PAUSE_MS);
        try {
          const { status, placement } = await checkPlacementInvoice(invoiceId);
          if (cancelled) return;
          if (status === "success") {
            await settlePlacement(placement);
            stateStore.set("paid");
            return;
          }
          if (FAILED.has(status)) {
            stateStore.set("failed");
            return;
          }
        } catch {
          // Мережа чи банк мовчать: пробуємо ще, а після останньої спроби скажемо «ще обробляється».
        }
      }
      if (!cancelled) stateStore.set("pending");
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, session.status]);

  return { state, dismiss };
};
