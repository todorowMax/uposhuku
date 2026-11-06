"use client";

// components/deals/use-transfer-card.ts
//
// Логіка картки прямого переказу: один раз читаємо знімок реквізитів угоди (кожне читання замовником
// пишеться в журнал, тож без опитування), копіювання в буфер з підтвердженням, посилання для QR.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { nbuQrLink } from "@/lib/deals/nbu-qr";
import { bankOf, type PaymentMethod, type Requisites } from "@/lib/deals/requisites";
import { readPickedVia, writePickedVia } from "@/lib/deals/picked-via";
import { transferPurpose } from "@/lib/deals/transfer";
import { fetchDealRequisites } from "@/lib/requisites/client";

export namespace TransferCardTypes {
  export type State = { kind: "loading" } | { kind: "missing" } | { kind: "error"; message: string } | { kind: "ready"; requisites: Requisites; methods: PaymentMethod[]; qr: boolean };
}

const COPIED_MS = 2000;
export const COPY_FAILED = "Не вдалося скопіювати: виділіть текст вручну";

export const useTransferCard = (dealId: string, dealNumber: string, amount: number) => {
  const [state, setState] = useState<TransferCardTypes.State>({ kind: "loading" });
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toState = useCallback(async (): Promise<TransferCardTypes.State> => {
    try {
      const view = await fetchDealRequisites(dealId);
      return view.requisites && view.methods.length > 0 ? { kind: "ready", requisites: view.requisites, methods: view.methods, qr: view.qr } : { kind: "missing" };
    } catch (reason) {
      return { kind: "error", message: reason instanceof ApiError ? reason.message : "Не вдалося завантажити реквізити." };
    }
  }, [dealId]);

  useEffect(() => {
    let cancelled = false;
    void toState().then((next) => !cancelled && setState(next));
    return () => {
      cancelled = true;
    };
  }, [toState]);

  const reload = () => {
    setState({ kind: "loading" });
    void toState().then(setState);
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const purpose = transferPurpose(dealNumber);
  const bank = state.kind === "ready" && state.qr ? bankOf(state.requisites) : null;
  const qrLink = bank ? nbuQrLink({ ...bank, amount, purpose }) : null;
  // Вибрана вкладка переживає перезавантаження сторінки (повернення з застосунку банку): тримаємо її в sessionStorage.
  const [picked, setPickedState] = useState<PaymentMethod | null>(() => readPickedVia(dealId));
  const setPicked = (method: PaymentMethod) => {
    setPickedState(method);
    writePickedVia(dealId, method);
  };
  // Вибраний замовником спосіб, інакше перший доступний.
  const via = state.kind === "ready" ? (picked && state.methods.includes(picked) ? picked : state.methods[0]) : null;

  /** Копіює текст і на мить позначає кнопку. Без дозволу на буфер показуємо підказку виділити вручну. */
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopied(null);
      setCopyError(COPY_FAILED);
      return;
    }
    setCopyError(null);
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  return { state, copied, copyError, purpose, qrLink, via, setPicked, copy, reload };
};
