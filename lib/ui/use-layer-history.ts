"use client";

// lib/ui/use-layer-history.ts
//
// Системна кнопка «назад» закриває верхній шар (екран, шторку), а не йде зі сторінки. Відкритий шар кладе
// запис в історію; `popstate` закриває верхній; закриття кнопкою прибирає свій запис (history.go), не зачепивши
// решту. Рішення про стек у `layer-stack.ts`, тут лише ефекти. Один слухач `popstate` на всю сторінку.

import { useEffect, useId, useRef } from "react";
import { closeLayer, emptyStack, openLayer, popLayer, topLayerId, type LayerStackTypes } from "@/lib/ui/layer-stack";

const LAYER_KEY = "__layer";

const store = {
  stack: emptyStack as LayerStackTypes.Stack,
  /** Скільки подій popstate чекаємо від наших же history.go: їх не вважаємо натисканням «назад». */
  ignore: 0,
  listening: false,
  closers: new Map<string, () => void>(),
  /** Що чекає, поки наші history.go відпрацюють (наступний шар відкриваємо лише після них). */
  waiting: [] as (() => void)[],
  /** Закриття шару відкладено на мить: React у розробці знімає й ставить ефект назад, це не справжнє закриття. */
  pending: new Map<string, ReturnType<typeof setTimeout>>(),
};

const flushWaiting = () => {
  if (store.ignore > 0 || store.pending.size > 0) return;
  const queued = store.waiting.splice(0);
  queued.forEach((run) => run());
};

const currentLayerId = (): string | null => {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null) return null;
  const id = (state as Record<string, unknown>)[LAYER_KEY];
  return typeof id === "string" ? id : null;
};

const goBack = (steps: number) => {
  if (steps <= 0) return;
  store.ignore += 1;
  window.history.go(-steps);
};

const onPopState = () => {
  if (store.ignore > 0) {
    store.ignore -= 1;
    flushWaiting();
    return;
  }
  const result = popLayer(store.stack);
  store.stack = result.stack;
  if (result.close) store.closers.get(result.close)?.();
  goBack(result.extra);
};

const openInHistory = (id: string, close: () => void) => {
  store.closers.set(id, close);
  const pending = store.pending.get(id);
  if (pending !== undefined) {
    // Той самий шар одразу відкрито знову (повторний запуск ефекту): запис в історії лишається.
    clearTimeout(pending);
    store.pending.delete(id);
    return;
  }
  const result = openLayer(store.stack, id);
  store.stack = result.stack;
  if (!store.listening) {
    window.addEventListener("popstate", onPopState);
    store.listening = true;
  }
  if (result.push) window.history.pushState({ ...(window.history.state as object | null), [LAYER_KEY]: id }, "");
};

const closeNow = (id: string) => {
  const topBefore = topLayerId(store.stack);
  const result = closeLayer(store.stack, id);
  store.stack = result.stack;
  store.closers.delete(id);
  // Якщо за час відкриття людина пішла на іншу сторінку, поточний запис уже не наш: назад не ходимо.
  if (result.go > 0 && currentLayerId() === topBefore) goBack(result.go);
};

const closeInHistory = (id: string) => {
  store.pending.set(
    id,
    setTimeout(() => {
      store.pending.delete(id);
      closeNow(id);
      flushWaiting();
    }, 0),
  );
};

/**
 * Виконує `run`, щойно історія браузера скінчить рух від закритих шарів. Шторка закрилась і зараз відкриє екран:
 * якщо екран кине запис раніше, ніж пройде `history.go` шторки, перехід зачепить не той запис.
 * Викликати після того, як шар закрито (стан уже оновлено), напр. в `setTimeout(…, 0)`.
 */
export const afterLayerHistory = (run: () => void) => {
  if (store.ignore === 0 && store.pending.size === 0) return run();
  store.waiting.push(run);
};

/**
 * Закрили один шар і відкриваємо інший (редактор профілю, потім «Стати на карту»): `run` йде за мить, коли
 * стан закриття вже оновлено, і лише після `history.go` закритого шару.
 */
export const openAfterLayers = (run: () => void) => {
  setTimeout(() => afterLayerHistory(run), 0);
};

/**
 * Привʼязує шар до історії браузера, поки `open` істинний. `onClose` викликається, коли людина натиснула
 * системне «назад»; закриття кнопкою (open став false) запис прибирає саме.
 */
export const useLayerHistory = (open: boolean, onClose: () => void) => {
  const id = useId();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    openInHistory(id, () => close.current());
    return () => closeInHistory(id);
  }, [open, id]);
};
