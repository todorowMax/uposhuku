"use client";

// components/fees/use-fees-return.ts
//
// Повернення з оплати комісії: банк веде назад на `/?fees=paid&invoice=<id рахунку>`. Читаємо параметри, прибираємо
// їх з адреси, відкриваємо екран «Рахунок» і питаємо сервер про стан рахунку (до 5 разів із паузою 2 с, поки банк
// не дасть фінальний статус). Так само зроблено для розміщення (components/placement/use-placement-return.ts).

import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { checkFeeInvoice, feesOpenStore, refreshFees } from "@/lib/fees/client";
import type { FeeTypes } from "@/lib/fees/fees.types";
import { invoiceOutcome } from "@/lib/fees/view";
import { createStore, useStore } from "@/lib/store";

export type FeesReturnState = "checking" | FeeTypes.InvoiceOutcome;

const ATTEMPTS = 5;
const PAUSE_MS = 2000;

const invoiceStore = createStore<string | null>(null);
/** Що показати на екрані «Рахунок» після повернення з банку; null, коли повернення не було. */
export const feesReturnStore = createStore<FeesReturnState | null>(null);

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Один раз за відкриття сторінки: id рахунку з адреси, і обидва параметри зникають. */
const takeInvoiceId = (): string | null => {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("invoice");
  const flagged = url.searchParams.get("fees") === "paid";
  if (!flagged) return null;
  url.searchParams.delete("fees");
  url.searchParams.delete("invoice");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return id;
};

export const dismissFeesReturn = () => {
  invoiceStore.set(null);
  feesReturnStore.set(null);
};

/** Ждемо фінального статусу: оплачено, відмова чи «ще обробляється» після останньої спроби. */
const settle = async (invoiceId: string, cancelled: () => boolean): Promise<FeesReturnState> => {
  for (let attempt = 0; attempt < ATTEMPTS && !cancelled(); attempt += 1) {
    if (attempt > 0) await wait(PAUSE_MS);
    try {
      const outcome = invoiceOutcome((await checkFeeInvoice(invoiceId)).status);
      if (outcome !== "pending") return outcome;
    } catch {
      // Мережа чи банк мовчать: пробуємо ще.
    }
  }
  return "pending";
};

export const useFeesReturn = () => {
  const session = useStore(sessionStore);
  const invoiceId = useStore(invoiceStore);

  useEffect(() => {
    const id = takeInvoiceId();
    // Параметр `fees=paid` без id рахунку: просто покажемо екран, статусу немає.
    if (id === null) return;
    invoiceStore.set(id);
    feesReturnStore.set("checking");
    feesOpenStore.set(true);
  }, []);

  useEffect(() => {
    if (!invoiceId || session.status !== "user") return;
    let cancelled = false;
    void (async () => {
      const state = await settle(invoiceId, () => cancelled);
      if (cancelled) return;
      await refreshFees();
      feesReturnStore.set(state);
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, session.status]);
};
