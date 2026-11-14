"use client";

// lib/fees/client.ts
//
// Рахунок комісії в браузері: що людина винна, відкритий екран «Рахунок», створення рахунку в банку й
// звірка його стану. Сервер рахує все сам (lib/server/fee-repo.ts), тут лише читаємо й показуємо.

import { useEffect } from "react";
import { callApi } from "@/lib/deals/client";
import { createStore, useStore } from "@/lib/store";
import type { FeeTypes } from "./fees.types";

/** Рахунок людини; null, поки не завантажили або людина вийшла. */
export const feesStore = createStore<FeeTypes.Overview | null>(null);
/** Екран «Рахунок» відкритий. */
export const feesOpenStore = createStore(false);

/** Завантажує рахунок і кладе його в сховище: меню бере звідти борг, екран свіжі рядки. */
export const loadFees = async (): Promise<FeeTypes.Overview> => {
  const overview = await callApi<FeeTypes.Overview>("/api/fees");
  feesStore.set(overview);
  return overview;
};

/** Те саме без помилки: меню й форма не мають ламатися, коли рахунок не завантажився. */
export const refreshFees = async (): Promise<void> => {
  try {
    await loadFees();
  } catch {
    // Лишаємо, що було: екран «Рахунок» сам покаже помилку й «Спробувати ще».
  }
};

/** Створює рахунок у банку на весь борг. Далі людину ведемо на `pageUrl`; оплату в журнал пише вебхук чи звірка. */
export const startFeePayment = (): Promise<FeeTypes.InvoiceStart> => callApi<FeeTypes.InvoiceStart>("/api/fees/invoice", { method: "POST", body: JSON.stringify({}) });

/** Стан рахунку; поки він не фінальний, сервер сам питає банк. */
export const checkFeeInvoice = (id: string): Promise<FeeTypes.InvoiceCheck> => callApi<FeeTypes.InvoiceCheck>(`/api/fees/invoices/${encodeURIComponent(id)}`);

export const forgetFees = () => {
  feesStore.set(null);
  feesOpenStore.set(false);
};

/** Чи нараховується комісія за фактом цій людині (для рядка у формі умов). Підвантажує рахунок, якщо його ще немає. */
export const useFeesEnabled = (): boolean => {
  const overview = useStore(feesStore);
  useEffect(() => {
    if (feesStore.get() === null) void refreshFees();
  }, []);
  return overview?.enabled === true;
};
