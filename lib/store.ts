// lib/store.ts
//
// Маленьке сховище з підпискою для useSyncExternalStore: для стану, який
// ділять сусіди на сторінці без спільного батька (поле запиту, карта,
// кнопка акаунта). Без бібліотек: потрібні лише get, set і підписка.

import { useSyncExternalStore } from "react";

export interface Store<T> {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
  initial: T;
}

export const createStore = <T,>(initial: T): Store<T> => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    initial,
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const useStore = <T,>(store: Store<T>) => useSyncExternalStore(store.subscribe, store.get, () => store.initial);
