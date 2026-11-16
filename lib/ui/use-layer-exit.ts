"use client";

// lib/ui/use-layer-exit.ts
//
// Закриття шару з рухом: панель спершу виходить до свого краю (`exitLayer`), і лише потім `close` знімає її з
// екрана. Другий виклик під час виходу нічого не робить. Якщо фокус був усередині шару, після закриття він
// переходить на те, що шар повернуло (`returnFocusTo`), а не губиться на body. Знятий з екрана шар рух обриває.

import { useCallback, useEffect, useRef } from "react";
import { exitLayer, type LayerEdge } from "@/lib/ui/transitions";

export namespace LayerExitTypes {
  export type Options = {
    /** Шар, що виходить; береться в момент закриття. */
    layer: () => HTMLElement | null;
    /** Край, де шар живе саме зараз (на телефоні низ, на десктопі правий бік). */
    edge: () => LayerEdge;
    /** Зняти шар з екрана (змінити стан). */
    close: () => void;
    /** Куди віддати фокус після закриття, якщо він був у шарі. Викликається після `close`, коли розмітка оновилась. */
    returnFocusTo?: () => HTMLElement | null;
  };
}

export const useLayerExit = ({ layer, edge, close, returnFocusTo }: LayerExitTypes.Options) => {
  const leaving = useRef<{ kill: () => void } | null>(null);
  const refocus = useRef(false);

  useEffect(
    () => () => {
      leaving.current?.kill();
      leaving.current = null;
    },
    [],
  );

  // Фокус віддаємо після рендера, що прибрав шар: тоді кнопка, яка його повертає, уже в розмітці.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    returnFocusTo?.()?.focus();
  });

  return useCallback(() => {
    if (leaving.current) return;
    const node = layer();
    if (!node) return close();
    const hadFocus = node.contains(document.activeElement);
    leaving.current = exitLayer(node, edge(), () => {
      leaving.current = null;
      refocus.current = hadFocus;
      close();
    });
  }, [layer, edge, close]);
};
