"use client";

// components/payouts/use-payout-form.ts
//
// Логіка розділу «Виплати за безпечну угоду»: завантаження стану, поля, перевірка тими самими правилами, що на
// сервері, подання заявки. ІПН живе лише в стані форми й зникає після подання.

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { validatePayoutApplication } from "@/lib/deals/payout";
import { fetchPayout, submitPayoutApplication, type PayoutStateDto } from "@/lib/payouts/client";

export namespace PayoutFormTypes {
  export type Fields = { fopName: string; taxId: string; accountConfirmed: boolean; consent: boolean };
  export type Load = "loading" | "ready" | "error";
}

const EMPTY: PayoutFormTypes.Fields = { fopName: "", taxId: "", accountConfirmed: false, consent: false };

const REASON = (reason: unknown, fallback: string) => (reason instanceof ApiError ? reason.message : fallback);

export const usePayoutForm = () => {
  const [load, setLoad] = useState<PayoutFormTypes.Load>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<PayoutStateDto | null>(null);
  const [fields, setFields] = useState<PayoutFormTypes.Fields>(EMPTY);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPayout()
      .then((data) => {
        if (cancelled) return;
        setState(data);
        setLoad("ready");
      })
      .catch((reason) => {
        if (cancelled) return;
        setLoadError(REASON(reason, "Не вдалося завантажити стан виплат."));
        setLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = () => {
    setLoad("loading");
    setLoadError(null);
    setAttempt((value) => value + 1);
  };

  const setField = <K extends keyof PayoutFormTypes.Fields>(name: K, value: PayoutFormTypes.Fields[K]) => {
    setFields((current) => ({ ...current, [name]: value }));
    setError(null);
  };

  const submit = async () => {
    const checked = validatePayoutApplication(fields);
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    setError(null);
    try {
      setState(await submitPayoutApplication(checked.value));
      setFields(EMPTY);
    } catch (reason) {
      setError(REASON(reason, "Не вдалося подати заявку."));
    } finally {
      setBusy(false);
    }
  };

  return { load, loadError, state, fields, busy, error, reload, setField, submit };
};
