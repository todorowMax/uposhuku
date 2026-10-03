// lib/map/performers.ts
//
// Хто зараз на карті: демо-виконавці, справжні виконавці з акаунтів
// (/api/map/performers) і, якщо людина опублікувала профіль, вона сама. Карта, фільтри й картки читають звідси, а не з DEMO_PERFORMERS
// напряму: профіль з'являється без перезавантаження. Коли буде база,
// сюди прийдуть справжні профілі, а демо зникнуть.

import { createStore, useStore } from "@/lib/store";
import { DEMO_PERFORMERS } from "./demo";
import type { Performer } from "./types";

let real: Performer[] = [];
let mine: Performer | null = null;

const merged = () => {
  const own = mine;
  // Себе не дублюємо: сервер віддає й мій профіль, а «mine» у мене свій.
  const others = own ? real.filter((person) => person.id !== own.id) : real;
  return [...DEMO_PERFORMERS, ...others, ...(own ? [own] : [])];
};

export const performersStore = createStore<Performer[]>(DEMO_PERFORMERS);

export const getPerformers = () => performersStore.get();
export const usePerformers = () => useStore(performersStore);

/** Справжні виконавці з сервера. */
export const setRealPerformers = (list: Performer[]) => {
  real = list;
  performersStore.set(merged());
};

/** Свій профіль на карті (або прибрати, якщо null). */
export const setMyPerformer = (next: Performer | null) => {
  mine = next;
  performersStore.set(merged());
};

/** Змінити свого виконавця на місці, напр. рівень після оплати. */
export const updateMyPerformer = (patch: Partial<Performer>) => {
  if (mine) mine = { ...mine, ...patch };
  performersStore.set(merged());
};

export const loadRealPerformers = async () => {
  try {
    const response = await fetch("/api/map/performers", { cache: "no-store" });
    if (!response.ok) return;
    const { performers } = (await response.json()) as { performers: Performer[] };
    setRealPerformers(performers);
  } catch {
    // Без мережі лишаються демо.
  }
};
