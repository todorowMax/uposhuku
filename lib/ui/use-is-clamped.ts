"use client";

// lib/ui/use-is-clamped.ts
//
// Чи обрізав `line-clamp-*` текст: вимір після розкладки й при зміні ширини. Поки текст розгорнуто, вимір не міняємо,
// щоб кнопка «Згорнути» не зникала.

import { useLayoutEffect, useRef, useState } from "react";

export const useIsClamped = (text: string, expanded: boolean) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || expanded) return;
    const measure = () => setClamped(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, expanded]);

  return { ref, clamped };
};
