"use client";

// components/fees/use-fees-screen.ts
//
// Логіка екрана «Рахунок»: свіжі дані за відкриттям, стан завантаження, оплата (рахунок у банку й перехід на його
// сторінку), результат повернення з банку.

import { useCallback, useEffect, useState } from "react";
import { feesOpenStore, feesStore, loadFees, startFeePayment } from "@/lib/fees/client";
import { debtKop } from "@/lib/fees/view";
import { useStore } from "@/lib/store";
import { feesReturnStore } from "./use-fees-return";

export type FeesLoad = "loading" | "ready" | "error";

export const useFeesScreen = () => {
  const open = useStore(feesOpenStore);
  const overview = useStore(feesStore);
  const returned = useStore(feesReturnStore);
  const [failed, setFailed] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Свіжі дані за відкриттям; без стану в тілі ефекту: «завантажується» це відсутність даних і помилки.
  const fetchFresh = useCallback(() => loadFees().then(() => setFailed(false), () => setFailed(true)), []);
  useEffect(() => {
    void fetchFresh();
  }, [fetchFresh]);
  const reload = () => {
    setFailed(false);
    void fetchFresh();
  };
  const load: FeesLoad = overview ? "ready" : failed ? "error" : "loading";

  const pay = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const { pageUrl } = await startFeePayment();
      window.location.assign(pageUrl);
    } catch (reason) {
      setPayError(reason instanceof Error ? reason.message : "Не вдалося створити рахунок. Спробуйте ще раз.");
      setPaying(false);
    }
  };

  const onOpenChange = (next: boolean) => feesOpenStore.set(next);
  const debt = debtKop(overview?.balanceKop ?? 0);
  return { open, onOpenChange, overview, load, reload, debt, paying, payError, pay, returned };
};
