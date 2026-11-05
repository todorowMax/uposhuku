"use client";

// components/requisites/use-requisites-form.ts
//
// Логіка форми реквізитів виконавця: завантаження, поля, перевірка тими самими правилами, що на сервері,
// збереження. Значення живуть лише в стані цієї форми.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { validateRequisites, type Requisites } from "@/lib/deals/requisites";
import { fetchOwnRequisites, saveOwnRequisites, type OwnRequisitesDto } from "@/lib/requisites/client";

export namespace RequisitesFormTypes {
  export type Fields = { recipient: string; iban: string; taxCode: string; payUrl: string; usdtTrc20: string; binanceId: string };
  export type Load = "loading" | "ready" | "error";
}

const EMPTY: RequisitesFormTypes.Fields = { recipient: "", iban: "", taxCode: "", payUrl: "", usdtTrc20: "", binanceId: "" };

const toFields = (value: Requisites | null | undefined): RequisitesFormTypes.Fields =>
  value ? { recipient: value.recipient, iban: value.iban, taxCode: value.taxCode, payUrl: value.payUrl ?? "", usdtTrc20: value.usdtTrc20 ?? "", binanceId: value.binanceId ?? "" } : EMPTY;

const REASON = (reason: unknown, fallback: string) => (reason instanceof ApiError ? reason.message : fallback);

export const useRequisitesForm = () => {
  const [load, setLoad] = useState<RequisitesFormTypes.Load>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [own, setOwn] = useState<OwnRequisitesDto | null>(null);
  const [fields, setFields] = useState<RequisitesFormTypes.Fields>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((data: OwnRequisitesDto) => {
    setOwn(data);
    setFields(toFields(data.pending?.requisites ?? data.requisites));
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
    setError(null);
  };

  const save = async () => {
    const checked = validateRequisites(fields);
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { outcome, ...data } = await saveOwnRequisites(checked.value);
      apply(data);
      setNotice(outcome.kind === "saved" ? "Реквізити збережено." : "Зміну прийнято: вона набуде чинності через 24 години. Ми надіслали вам лист.");
    } catch (reason) {
      setError(REASON(reason, "Не вдалося зберегти реквізити."));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setNotice(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setFields(toFields(own?.pending?.requisites ?? own?.requisites));
    setError(null);
    setEditing(false);
  };

  return { load, loadError, own, fields, editing, busy, error, notice, reload, setField, save, startEditing, cancelEditing };
};
