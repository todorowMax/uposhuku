// lib/map/performers.ts
//
// Хто зараз на карті: виконавці з /api/map/performers (профіль опубліковано й
// розміщення оплачено) і, якщо людина опублікувала профіль, вона сама. Карта,
// фільтри й картки читають звідси: свій профіль з'являється без перезавантаження.

import { createStore, useStore } from "@/lib/store";
import { registerCustomAvatar } from "./portrait";
import type { Performer } from "./types";

let real: Performer[] = [];
let mine: Performer | null = null;

const merged = () => {
  // Себе не дублюємо: сервер віддає й мій профіль, а «mine» у мене свій, але цифри беремо серверні.
  const own = mine ? { ...mine, stats: real.find((person) => person.id === mine?.id)?.stats ?? mine.stats } : null;
  const others = own ? real.filter((person) => person.id !== own.id) : real;
  return [...others, ...(own ? [own] : [])];
};

export const performersStore = createStore<Performer[]>([]);

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

/** Фото → індекс портрета на карті. Адреси стабільні (UUID у ключі), тож кожне фото реєструємо раз. */
const photoIndexes = new Map<string, Promise<number>>();
const portraitFor = (photo: string) => {
  let index = photoIndexes.get(photo);
  if (!index) {
    index = registerCustomAvatar(photo).catch(() => 0);
    photoIndexes.set(photo, index);
  }
  return index;
};

export const loadRealPerformers = async () => {
  try {
    const response = await fetch("/api/map/performers", { cache: "no-store" });
    if (!response.ok) return;
    const { performers } = (await response.json()) as { performers: Performer[] };
    setRealPerformers(await Promise.all(performers.map(async (person) => (person.photo ? { ...person, avatarIndex: await portraitFor(person.photo) } : person))));
  } catch {
    // Без мережі лишаються демо.
  }
};
