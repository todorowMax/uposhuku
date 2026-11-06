// lib/map/refresh-gate.ts
//
// Склейка подій «map»: кілька підряд дають одне перечитування, і воно стартує
// з випадковою затримкою до `spread` мс, щоб усі клієнти не прийшли разом.

interface Timers {
  set: (run: () => void, ms: number) => number;
  clear: (id: number) => void;
}

const browserTimers: Timers = { set: (run, ms) => window.setTimeout(run, ms), clear: (id) => window.clearTimeout(id) };

export const MAP_REFRESH_SPREAD = 3000;

interface GateOptions {
  spread?: number;
  random?: () => number;
  timers?: Timers;
}

export const createRefreshGate = (run: () => void, { spread = MAP_REFRESH_SPREAD, random = Math.random, timers = browserTimers }: GateOptions = {}) => {
  let pending: number | null = null;
  return {
    /** Запросити перечитування: якщо вже заплановано, нічого не додає. */
    request: () => {
      if (pending !== null) return;
      pending = timers.set(() => {
        pending = null;
        run();
      }, Math.floor(random() * spread));
    },
    cancel: () => {
      if (pending !== null) timers.clear(pending);
      pending = null;
    },
  };
};
