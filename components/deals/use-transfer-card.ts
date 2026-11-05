"use client";

// components/deals/use-transfer-card.ts
//
// Логіка картки прямого переказу: один раз читаємо знімок реквізитів угоди (кожне читання замовником
// пишеться в журнал, тож без опитування), копіювання в буфер з підтвердженням, посилання для QR.

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { nbuQrLink } from "@/lib/deals/nbu-qr";
import type { Requisites } from "@/lib/deals/requisites";
import { transferPurpose } from "@/lib/deals/transfer";
import { fetchDealRequisites } from "@/lib/requisites/client";

export namespace TransferCardTypes {
  export type State = { kind: "loading" } | { kind: "missing" } | { kind: "error"; message: string } | { kind: "ready"; requisites: Requisites };
}

const COPIED_MS = 2000;

export const useTransferCard = (dealId: string, dealNumber: string, amount: number) => {
  const [state, setState] = useState<TransferCardTypes.State>({ kind: "loading" });
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toState = useCallback(async (): Promise<TransferCardTypes.State> => {
    try {
      const view = await fetchDealRequisites(dealId);
      return view.requisites ? { kind: "ready", requisites: view.requisites } : { kind: "missing" };
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
  const qrLink = state.kind === "ready" ? nbuQrLink({ ...state.requisites, amount, purpose }) : null;

  /** Копіює текст і на мить позначає кнопку. Без дозволу на буфер лишається ручне виділення. */
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  return { state, copied, purpose, qrLink, copy, reload };
};
