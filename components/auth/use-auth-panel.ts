"use client";

// components/auth/use-auth-panel.ts
//
// Логіка входу й публікації запиту: пошта, код, Google, повторний лист, публікація чернетки після входу.
// Перенесено з компонента без змін поведінки; розмітка в `auth-panel.tsx` і `parts/`.

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { gsap } from "gsap";
import { useTermsConsent } from "@/components/auth/use-terms-consent";
import { useTurnstile } from "@/components/auth/use-turnstile";
import { askPhone } from "@/lib/phone/client";
import { PHONE_REQUIRED_CODE } from "@/lib/phone/codes";
import { ApiError, addPublishedRequest, authFlowStore, publishRequest, sessionStore, startEmail, verifyEmail } from "@/lib/auth/client";
import { profileEditorStore } from "@/lib/profile/client";
import { clearDraft, loadDraft, saveDraft } from "@/lib/requests/draft";
import type { PublishedRequest, RequestDraft } from "@/lib/requests/types";
import { useStore } from "@/lib/store";
import { EVENTS, track } from "@/lib/telemetry/track";

export namespace AuthPanelTypes {
  export type Step = "email" | "code" | "publishing" | "failed";
}

/** Повторний лист — не частіше разу на хвилину, як домовились у плані. */
const RESEND_SECONDS = 60;
const emptyCode = (length = 6) => Array.from({ length }, () => "");

/**
 * Публікація після підтвердження телефона, коли вікно входу вже закрите. Не вдалось (номер не підтвердили чи сервер
 * відмовив): чернетка лишається в полі запиту, людина опублікує її сама.
 */
const publishAfterPhone = async (draft: RequestDraft, finish: (request: PublishedRequest) => void) => {
  if (!(await askPhone())) return;
  try {
    finish(await publishRequest(draft));
  } catch {
    // Чернетка не стерта: поле запиту покаже її знову.
  }
};

export const useAuthPanel = (onPublished: (request: PublishedRequest) => void) => {
  const flow = useStore(authFlowStore);
  const session = useStore(sessionStore);
  const mode = flow?.mode ?? "login";
  const [step, setStep] = useState<AuthPanelTypes.Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(() => emptyCode());
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const terms = useTermsConsent();
  const captcha = useTurnstile();
  const [draft] = useState<RequestDraft | null>(() => (mode === "publish" ? (loadDraft()?.draft ?? null) : null));
  const bodyRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<{ focus: () => void }>(null);
  const startedRef = useRef(false);

  // З чого почали: запит (publish), кнопка «Увійти» (login) чи «Я виконавець» (performer).
  useEffect(() => {
    track(EVENTS.authStarted, { from: mode === "publish" ? "request" : mode === "performer" ? "performer" : "account" });
  }, [mode]);

  const close = () => {
    if (step !== "publishing") authFlowStore.set(null);
  };

  const finishPublish = (request: PublishedRequest) => {
    clearDraft();
    onPublished(request);
    addPublishedRequest(request);
  };

  const publish = async () => {
    if (!draft) {
      setError("Чернетка запиту загубилась. Напишіть його ще раз.");
      setStep("failed");
      return;
    }
    setStep("publishing");
    setError(null);
    try {
      finishPublish(await publishRequest(draft));
      authFlowStore.set(null);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === PHONE_REQUIRED_CODE) {
        // Шторка над шторкою заборонена (DESIGN.md, «Шари»): вхід закриваємо, чернетка лишається збереженою,
        // і після підтвердження телефона запит публікується вже без вікна входу.
        authFlowStore.set(null);
        void publishAfterPhone(draft, finishPublish);
        return;
      }
      setError(reason instanceof ApiError ? reason.message : "Не вдалося опублікувати запит.");
      setStep("failed");
    }
  };

  // Хто вже увійшов, одразу публікує; просто «Увійти» для нього не має сенсу.
  useEffect(() => {
    if (startedRef.current || session.status === "loading") return;
    startedRef.current = true;
    if (session.status !== "user") return;
    // Публікація (вона міняє стан) стартує поза тілом ефекту.
    if (mode === "publish") queueMicrotask(() => void publish());
    else {
      authFlowStore.set(null);
      if (mode === "performer") profileEditorStore.set(true);
    }
  }, [session.status]);

  // Кроки змінюються з легким зсувом.
  useLayoutEffect(() => {
    if (!bodyRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(bodyRef.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!terms.confirm() || captcha.pending) return;
    setBusy(true);
    setError(null);
    try {
      const result = await startEmail(email, captcha.token);
      setMock(result.mock);
      setHint(result.hint ?? null);
      setDigits(emptyCode(result.codeLength));
      setCooldown(RESEND_SECONDS);
      setStep("code");
      track(EVENTS.authCodeSent);
      window.setTimeout(() => codeRef.current?.focus(), 60);
    } catch (reason) {
      track(EVENTS.authFailed, { method: "email", reason: "send" });
      setError(reason instanceof ApiError ? reason.message : "Не вдалося надіслати код.");
    } finally {
      // Токен одноразовий: і після успіху, і після відмови потрібен новий (повторний лист, інша пошта).
      captcha.reset();
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await verifyEmail(email, code, terms.agreed);
      if (mode === "publish") await publish();
      else {
        authFlowStore.set(null);
        if (mode === "performer") profileEditorStore.set(true);
      }
    } catch (reason) {
      track(EVENTS.authFailed, { method: "email", reason: "code" });
      setError(reason instanceof ApiError ? reason.message : "Не вдалося перевірити код.");
      setDigits(emptyCode(digits.length));
      // Поки йшла перевірка, комірки були вимкнені: фокус у першу комірку ставимо, коли вони знову живі.
      window.setTimeout(() => codeRef.current?.focus(), 60);
      const group = bodyRef.current?.querySelector(".code-input");
      if (group) gsap.fromTo(group, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
    } finally {
      setBusy(false);
    }
  };

  const onDigits = (next: string[]) => {
    setDigits(next);
    if (error) setError(null);
    // Усі шість цифр — перевіряємо одразу, без окремої кнопки.
    if (next.every(Boolean) && !busy) void verify(next.join(""));
  };

  const changeEmail = (value: string) => {
    setEmail(value);
    setError(null);
  };

  const googleNext = mode === "publish" ? "/?auth=google" : mode === "performer" ? "/?auth=performer" : (flow?.next ?? "/");
  const googleHref = `/api/auth/google?next=${encodeURIComponent(googleNext)}&accepted=1`;
  const title =
    step === "code"
      ? mock
        ? "Код доступу"
        : "Код з листа"
      : step === "publishing"
        ? "Публікуємо запит"
        : step === "failed"
          ? "Не вдалося опублікувати"
          : mode === "publish"
            ? "Увійдіть, щоб знайти виконавця"
            : mode === "performer"
              ? "Профіль виконавця"
              : "Вхід";

  /** Перед переходом у Google чернетка запиту зберігається, щоб після повернення її опублікувати. */
  const beforeGoogle = (event: { preventDefault: () => void }) => {
    if (!terms.confirm()) return event.preventDefault();
    if (draft) saveDraft(draft, true);
  };

  return {
    mode,
    step,
    setStep,
    email,
    changeEmail,
    digits,
    hint,
    busy,
    error,
    mock,
    cooldown,
    terms,
    captcha: { pending: captcha.pending, failed: captcha.failed },
    captchaRef: captcha.boxRef,
    bodyRef,
    codeRef,
    close,
    publish,
    sendCode,
    onDigits,
    googleHref,
    beforeGoogle,
    title,
  };
};

export type AuthPanelState = ReturnType<typeof useAuthPanel>;
