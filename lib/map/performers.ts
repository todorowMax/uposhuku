// lib/map/performers.ts
//
// Хто зараз на карті: демо-виконавці й, якщо людина опублікувала профіль,
// вона сама. Карта, фільтри й картки читають звідси, а не з DEMO_PERFORMERS
// напряму: профіль з'являється без перезавантаження. Коли буде база,
// сюди прийдуть справжні профілі, а демо зникнуть.

import { createStore, useStore } from "@/lib/store";
import { DEMO_PERFORMERS } from "./demo";
import type { Performer } from "./types";

export const performersStore = createStore<Performer[]>(DEMO_PERFORMERS);

export const getPerformers = () => performersStore.get();
export const usePerformers = () => useStore(performersStore);

/** Свій профіль на карті (або прибрати, якщо null). */
export const setMyPerformer = (mine: Performer | null) => {
  performersStore.set(mine ? [...DEMO_PERFORMERS, mine] : DEMO_PERFORMERS);
};
