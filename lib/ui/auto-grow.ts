"use client";

// lib/ui/auto-grow.ts
//
// Багаторядкове поле, яке росте під текст: спершу від minRows до maxRows
// рядків, далі прокрутка всередині. Росте лише вгору, ніколи не стискається
// саме, тож розтягнуте вручну (resize-y) лишається таким, яким людина його
// зробила.

import { useLayoutEffect, useRef } from "react";

export const useAutoGrow = (value: string, maxRows = 10) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const lineHeight = Number.parseFloat(style.lineHeight) || 20;
    const chrome = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom) + Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
    const max = lineHeight * maxRows + chrome;
    el.style.maxHeight = "none";
    if (el.scrollHeight > el.clientHeight + 1) {
      el.style.height = `${Math.min(el.scrollHeight + (el.offsetHeight - el.clientHeight), max)}px`;
    }
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
  }, [value, maxRows]);
  return ref;
};
