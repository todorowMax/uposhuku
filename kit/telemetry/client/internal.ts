"use client";

// kit/telemetry/client/internal.ts
//
// Свої сесії, які не мають потрапити в статистику. Фільтр за IP на телефоні
// не працює: адреса змінюється на кожному перепідключенні. Тому позначаємо
// пристрій: відкрив застосунок із `?internal=1`, і цей браузер надалі шле
// `internal: true`, доки не скасуєш через `?internal=0`.

import { safeStorage } from "./config";

const storage = () => safeStorage("local");

/** Читає `?internal=` з адреси й запам'ятовує вибір для цього браузера. */
export const syncInternalTraffic = (search: string): void => {
  const value = new URLSearchParams(search).get("internal");
  if (value === null) return;
  if (value === "0" || value === "false") storage().remove("internal");
  else storage().write("internal", "1");
};

export const isInternalTraffic = (): boolean => typeof window !== "undefined" && storage().read("internal") === "1";
