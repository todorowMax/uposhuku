"use client";

// components/composer/use-request-params.ts
//
// Стан чипів умов запиту (бюджет, термін, де): що відкрито, текст власної суми, правки значення. Перенесено з
// компонента без змін поведінки; розмітка в `request-params.tsx` і `parts/`.

import { useState } from "react";
import { CITIES } from "@/lib/map/cities";
import { deadlineWindow, resolveDeadlineDate } from "@/lib/requests/deadline-date";
import type { Deadline } from "@/lib/requests/types";
import { useChannelEnabled } from "@/lib/telegram/channel-client";

export namespace RequestParamsTypes {
  export type Value = {
    budget: number | null;
    deadline: Deadline | null;
    /** Своя дата «до» (`YYYY-MM-DD`); коли вона є, чип показує її, а не готовий строк. */
    deadlineDate: string | null;
    cityId: string | null;
    /** «Віддалено» обрано явно: відрізняємо від «не вказано». */
    remote: boolean;
    /** Показати запит у публічному Telegram-каналі. */
    channel: boolean;
  };
  export type Kind = "budget" | "deadline" | "city";
}

export const EMPTY_PARAMS: RequestParamsTypes.Value = { budget: null, deadline: null, deadlineDate: null, cityId: null, remote: false, channel: true };

export const useRequestParams = (value: RequestParamsTypes.Value, onChange: (value: RequestParamsTypes.Value) => void) => {
  const [open, setOpen] = useState<RequestParamsTypes.Kind | null>(null);
  const channelEnabled = useChannelEnabled();
  const [budgetText, setBudgetText] = useState(value.budget ? String(value.budget) : "");
  const [dateText, setDateText] = useState(value.deadlineDate ?? "");
  const [dateError, setDateError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  const place = value.remote ? "Віддалено" : value.cityId ? CITIES.find((city) => city.id === value.cityId)?.name : null;
  const set = (patch: Partial<RequestParamsTypes.Value>) => onChange({ ...value, ...patch });
  const toggle = (kind: RequestParamsTypes.Kind) => setOpen((current) => (current === kind ? null : kind));
  const resetDate = () => {
    setDateOpen(false);
    setDateError(null);
  };
  const close = () => {
    setOpen(null);
    resetDate();
  };
  const openTo = (kind: RequestParamsTypes.Kind) => (next: boolean) => {
    setOpen(next ? kind : null);
    resetDate();
  };

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

  /** Готовий строк: своя дата замінюється ним. */
  const pickDeadline = (key: Deadline) => {
    set({ deadline: value.deadline === key && value.deadlineDate === null ? null : key, deadlineDate: null });
    close();
  };
  const clearDeadline = () => set({ deadline: null, deadlineDate: null });
  /** «Вказати дату»: показуємо поле, у ньому вже стоїть попередня дата чи «через 14 днів». */
  const startDate = () => {
    setDateOpen(true);
    if (dateText === "") setDateText(deadlineWindow(new Date()).fallback);
  };
  const changeDate = (next: string) => {
    setDateText(next);
    setDateError(null);
  };
  const applyDate = () => {
    const resolved = resolveDeadlineDate(dateText, new Date());
    if (!resolved.ok) {
      setDateError(resolved.reason);
      return;
    }
    set({ deadlineDate: resolved.date });
    close();
  };

  return { open, openTo, toggle, close, channelEnabled, budgetText, setBudgetText, place, set, applyBudget, pickBudget, clearBudget, dateText, dateError, dateOpen: dateOpen || value.deadlineDate !== null, dateRange: deadlineWindow(new Date()), pickDeadline, clearDeadline, startDate, changeDate, applyDate };
};
