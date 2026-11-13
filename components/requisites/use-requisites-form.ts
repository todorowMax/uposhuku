"use client";

// components/requisites/use-requisites-form.ts
//
// Логіка форми способів оплати виконавця: завантаження, поля, перемикачі способів, перевірка тими самими
// правилами, що на сервері, збереження. Значення живуть лише в стані цієї форми.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { withRiskAck } from "@/lib/legal/client";
import { validateRequisites, type Requisites, type RequisitesField } from "@/lib/deals/requisites";
import { fetchOwnRequisites, saveOwnRequisites, type OwnRequisitesDto } from "@/lib/requisites/client";

export namespace RequisitesFormTypes {
  export type Fields = { recipient: string; iban: string; taxCode: string; payUrl: string; usdtTrc20: string; binanceId: string; paypalUrl: string; wiseUrl: string };
  export type Method = "bank" | "usdt" | "binance" | "paypal" | "wise";
  export type Enabled = Record<Method, boolean>;
  export type Errors = Partial<Record<RequisitesField, string>>;
  export type Load = "loading" | "ready" | "error";
}

const EMPTY: RequisitesFormTypes.Fields = { recipient: "", iban: "", taxCode: "", payUrl: "", usdtTrc20: "", binanceId: "", paypalUrl: "", wiseUrl: "" };

/** Які поля форми належать якому способу: вимкнений спосіб не зберігається. */
const METHOD_FIELDS: Record<RequisitesFormTypes.Method, (keyof RequisitesFormTypes.Fields)[]> = {
  bank: ["recipient", "iban", "taxCode", "payUrl"],
  usdt: ["usdtTrc20"],
  binance: ["binanceId"],
  paypal: ["paypalUrl"],
  wise: ["wiseUrl"],
};
const METHODS = Object.keys(METHOD_FIELDS) as RequisitesFormTypes.Method[];

const toFields = (value: Requisites | null | undefined): RequisitesFormTypes.Fields => ({ ...EMPTY, ...Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => key in EMPTY)) });

/** Увімкнені способи за заповненими полями; на порожньому акаунті спершу ввімкнено банк. */
const toEnabled = (fields: RequisitesFormTypes.Fields): RequisitesFormTypes.Enabled => {
  const enabled = Object.fromEntries(METHODS.map((method) => [method, METHOD_FIELDS[method].some((key) => fields[key])])) as RequisitesFormTypes.Enabled;
  return METHODS.some((method) => enabled[method]) ? enabled : { ...enabled, bank: true };
};

const payloadOf = (fields: RequisitesFormTypes.Fields, enabled: RequisitesFormTypes.Enabled): RequisitesFormTypes.Fields => {
  const payload = { ...fields };
  for (const method of METHODS) if (!enabled[method]) for (const key of METHOD_FIELDS[method]) payload[key] = "";
  return payload;
};

const REASON = (reason: unknown, fallback: string) => (reason instanceof ApiError ? reason.message : fallback);

export const useRequisitesForm = () => {
  const [load, setLoad] = useState<RequisitesFormTypes.Load>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [own, setOwn] = useState<OwnRequisitesDto | null>(null);
  const [fields, setFields] = useState<RequisitesFormTypes.Fields>(EMPTY);
  const [enabled, setEnabled] = useState<RequisitesFormTypes.Enabled>(toEnabled(EMPTY));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<RequisitesFormTypes.Errors>({});
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((data: OwnRequisitesDto) => {
    const next = toFields(data.pending?.requisites ?? data.requisites);
    setOwn(data);
    setFields(next);
    setEnabled(toEnabled(next));
    setEditing(!data.requisites && !data.pending);
  }, []);

  const run = useCallback(async () => {
    try {
      apply(await fetchOwnRequisites());
      setLoad("ready");
    } catch (reason) {
      setLoadError(REASON(reason, "Не вдалося завантажити реквізити."));
      setLoad("error");
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchOwnRequisites()
      .then((data) => {
        if (cancelled) return;
        apply(data);
        setLoad("ready");
      })
      .catch((reason) => {
        if (cancelled) return;
        setLoadError(REASON(reason, "Не вдалося завантажити реквізити."));
        setLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const reload = () => {
    setLoad("loading");
    setLoadError(null);
    void run();
  };

  const setField = (name: keyof RequisitesFormTypes.Fields, value: string) => {
    setFields((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setError(null);
  };

  const setMethod = (method: RequisitesFormTypes.Method, on: boolean) => {
    setEnabled((current) => ({ ...current, [method]: on }));
    setErrors({});
    setError(null);
  };

  const save = async () => {
    const checked = validateRequisites(payloadOf(fields, enabled));
    if (!checked.ok) {
      setErrors(checked.field ? { [checked.field]: checked.error } : {});
      return setError(checked.field ? null : checked.error);
    }
    setBusy(true);
    setError(null);
    setErrors({});
    setNotice(null);
    try {
      const { outcome, ...data } = await withRiskAck(() => saveOwnRequisites(checked.value));
      apply(data);
      setNotice(outcome.kind === "saved" ? "Способи оплати збережено." : "Зміну прийнято: вона набуде чинності через 24 години. Ми надіслали вам лист.");
    } catch (reason) {
      setError(REASON(reason, "Не вдалося зберегти способи оплати."));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setNotice(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    const next = toFields(own?.pending?.requisites ?? own?.requisites);
    setFields(next);
    setEnabled(toEnabled(next));
    setError(null);
    setErrors({});
    setEditing(false);
  };

  return { load, loadError, own, fields, enabled, editing, busy, error, errors, notice, reload, setField, setMethod, save, startEditing, cancelEditing };
};
