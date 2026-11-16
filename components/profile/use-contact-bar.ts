"use client";

// components/profile/use-contact-bar.ts
//
// Низ профілю виконавця: кнопка «Описати задачу» перетворюється на поле введення тут же, у профілі, а не відкриває
// чат поверх нього. Хрестик повертає кнопку, нічого не закриваючи. Надіслати: перше повідомлення йде в розмову,
// далі профіль закривається й відкривається чат (це робить `onSend`). Гостю замість цього відкриється вхід, а текст
// збережеться. Морф кнопки в поле: GSAP Flip, який вантажиться окремо від першого завантаження профілю (MOT-6).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import type { Flip } from "gsap/Flip";
import { draftLimit } from "@/lib/chat/draft-limit";
import { sendErrorText, type SendResult } from "@/lib/chat/send-result";
import { prefersReducedMotion } from "@/lib/ui/media";

export namespace ContactBarTypes {
  export type Mode = "idle" | "compose";
  /** `login`: гостя відправлено входити, текст збережено; інакше результат відправки. */
  export type Outcome = SendResult | "login";
  export type Options = { onStart: () => void; onSend: (text: string) => Promise<Outcome> };
}

const MORPH_PROPS = "backgroundColor,borderRadius,boxShadow,color";

export const useContactBar = ({ onStart, onSend }: ContactBarTypes.Options) => {
  const [mode, setMode] = useState<ContactBarTypes.Mode>("idle");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const flipRef = useRef<typeof Flip | null>(null);
  const stateRef = useRef<Flip.FlipState | null>(null);
  /** Замок від подвійної відправки: стан оновиться лише з наступним рендером, а Enter може прийти раніше. */
  const sendingRef = useRef(false);

  // Flip вантажимо одразу, щойно рядок зʼявився, щоб перший дотик не чекав на нього.
  useEffect(() => {
    let alive = true;
    void import("gsap/Flip").then(({ Flip: plugin }) => {
      gsap.registerPlugin(plugin);
      if (alive) flipRef.current = plugin;
    });
    return () => {
      alive = false;
    };
  }, []);

  const change = (next: ContactBarTypes.Mode) => {
    const shell = shellRef.current;
    const plugin = flipRef.current;
    if (shell && plugin && !prefersReducedMotion()) stateRef.current = plugin.getState(shell, { props: MORPH_PROPS });
    setMode(next);
  };

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const plugin = flipRef.current;
    const state = stateRef.current;
    stateRef.current = null;
    // Поле з'явилось після дотику людини на кнопці: фокус у нього, а не autoFocus у розмітці.
    if (mode === "compose") textRef.current?.focus();
    if (!shell || !plugin || !state) return;
    plugin.from(state, { duration: 0.4, ease: "expo.out", absolute: false, props: MORPH_PROPS });
    const inner = shell.firstElementChild;
    if (inner) gsap.fromTo(inner, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.24, delay: 0.12, ease: "power2.out", clearProps: "opacity,transform" });
  }, [mode]);

  const open = () => {
    onStart();
    change("compose");
  };

  const cancel = () => {
    setError(null);
    change("idle");
  };

  const limit = draftLimit(draft.length);
  const canSend = draft.trim().length > 0 && !limit.over && !sending;

  const submit = async () => {
    if (!canSend || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    const outcome = await onSend(draft.trim());
    sendingRef.current = false;
    setSending(false);
    if (outcome === "login") return;
    if (!outcome.ok) setError(sendErrorText(outcome.status));
    // Успіх: профіль закривається, а чат відкривається поверх карти, поле лишати нема навіщо.
  };

  const type = (value: string) => {
    setDraft(value);
    setError(null);
  };

  return { mode, draft, type, sending, error, limit, canSend, shellRef, textRef, open, cancel, submit };
};
