"use client";

// components/composer/use-request-params.ts
//
// Стан чипів умов запиту (бюджет, термін, де): що відкрито, текст власної суми, правки значення. Перенесено з
// компонента без змін поведінки; розмітка в `request-params.tsx` і `parts/`.

import { useState } from "react";
import { CITIES } from "@/lib/map/cities";
import type { Deadline } from "@/lib/requests/types";
import { useChannelEnabled } from "@/lib/telegram/channel-client";

export namespace RequestParamsTypes {
  export type Value = {
    budget: number | null;
    deadline: Deadline | null;
    cityId: string | null;
    /** «Віддалено» обрано явно: відрізняємо від «не вказано». */
    remote: boolean;
    /** Показати запит у публічному Telegram-каналі. */
    channel: boolean;
  };
  export type Kind = "budget" | "deadline" | "city";
}

export const EMPTY_PARAMS: RequestParamsTypes.Value = { budget: null, deadline: null, cityId: null, remote: false, channel: true };

export const useRequestParams = (value: RequestParamsTypes.Value, onChange: (value: RequestParamsTypes.Value) => void) => {
  const [open, setOpen] = useState<RequestParamsTypes.Kind | null>(null);
  const channelEnabled = useChannelEnabled();
  const [budgetText, setBudgetText] = useState(value.budget ? String(value.budget) : "");

  const place = value.remote ? "Віддалено" : value.cityId ? CITIES.find((city) => city.id === value.cityId)?.name : null;
  const set = (patch: Partial<RequestParamsTypes.Value>) => onChange({ ...value, ...patch });
  const toggle = (kind: RequestParamsTypes.Kind) => setOpen((current) => (current === kind ? null : kind));
  const close = () => setOpen(null);
  const openTo = (kind: RequestParamsTypes.Kind) => (next: boolean) => setOpen(next ? kind : null);

  /** Своя сума: від 100 ₴, інакше бюджет не вказано. */
  const applyBudget = () => {
    const amount = Number(budgetText);
    set({ budget: amount >= 100 ? amount : null });
    close();
  };
  const pickBudget = (preset: number) => {
    set({ budget: preset });
    setBudgetText(String(preset));
    close();
  };
  const clearBudget = () => {
    set({ budget: null });
    setBudgetText("");
  };

  return { open, openTo, toggle, close, channelEnabled, budgetText, setBudgetText, place, set, applyBudget, pickBudget, clearBudget };
};
