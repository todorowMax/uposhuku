"use client";

// components/chat/inbox/use-inbox-motion.ts
//
// Рух вікна «Повідомлення» на десктопі: розкривається з кнопки, росте й стискається між розмірами, повертається
// в кнопку. На телефоні вікно на весь екран і без руху; при prefers-reduced-motion теж.

import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";

export type InboxSize = "compact" | "wide";

const noMotion = () => window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 767px)").matches;

export const useInboxMotion = (open: boolean, setOpen: (open: boolean) => void) => {
  const [size, setSize] = useState<InboxSize>("compact");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const sizeFrom = useRef<DOMRect | null>(null);

  // Панель розкривається з кнопки: розмір, форма й м'яке світіння.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!open || !panel) return;
    closing.current = false;
    if (noMotion() || !button) return;
    const to = panel.getBoundingClientRect();
    const from = button.getBoundingClientRect();
    const timeline = gsap.timeline({ onComplete: () => gsap.set(panel, { clearProps: "left,top,width,height,right,bottom,borderRadius" }) });
    timeline.fromTo(
      panel,
      { right: "auto", bottom: "auto", left: from.left, top: from.top, width: from.width, height: from.height, borderRadius: 20 },
      { left: to.left, top: to.top, width: to.width, height: to.height, borderRadius: 24, duration: 0.46, ease: "expo.out" },
      0,
    );
    timeline.fromTo(innerRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.26, ease: "power2.out" }, 0.18);
    return () => {
      timeline.kill();
    };
  }, [open]);

  // Компактне ↔ розгорнуте: вікно росте з поточного розміру, колонки проявляються.
  const toggleSize = () => {
    sizeFrom.current = panelRef.current?.getBoundingClientRect() ?? null;
    setSize((current) => (current === "wide" ? "compact" : "wide"));
  };
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const from = sizeFrom.current;
    sizeFrom.current = null;
    if (!panel || !from || noMotion()) return;
    const to = panel.getBoundingClientRect();
    const timeline = gsap.timeline({ onComplete: () => gsap.set(panel, { clearProps: "left,top,width,height,right,bottom" }) });
    timeline.fromTo(
      panel,
      { right: "auto", bottom: "auto", left: from.left, top: from.top, width: from.width, height: from.height },
      { left: to.left, top: to.top, width: to.width, height: to.height, duration: 0.44, ease: "expo.out" },
      0,
    );
    timeline.fromTo(panel.querySelectorAll(".inbox-side, .inbox-main"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.28, stagger: 0.07, ease: "power2.out" }, 0.14);
    return () => {
      timeline.kill();
    };
  }, [size]);

  const close = () => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (closing.current) return;
    if (!panel || !button || noMotion()) return setOpen(false);
    closing.current = true;
    const from = panel.getBoundingClientRect();
    const to = button.getBoundingClientRect();
    gsap
      .timeline({ onComplete: () => setOpen(false) })
      .set(panel, { right: "auto", bottom: "auto", left: from.left, top: from.top, width: from.width, height: from.height })
      .to(innerRef.current, { opacity: 0, duration: 0.12, ease: "power1.in" }, 0)
      .to(panel, { left: to.left, top: to.top, width: to.width, height: to.height, borderRadius: 20, duration: 0.34, ease: "expo.inOut" }, 0.04);
  };

  return { size, toggleSize, close, buttonRef, panelRef, innerRef };
};
