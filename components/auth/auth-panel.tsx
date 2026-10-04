"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { ArrowLeft, Loader2, MapPin, X } from "@/components/icons";
import { CodeInput } from "@/components/auth/code-input";
import { GoogleButton } from "@/components/auth/google-button";
import {
  ApiError,
  addPublishedRequest,
  authFlowStore,
  publishRequest,
  sessionStore,
  startEmail,
  verifyEmail,
} from "@/lib/auth/client";
import { profileEditorStore } from "@/lib/profile/client";
import { clearDraft, loadDraft, saveDraft } from "@/lib/requests/draft";
import type { PublishedRequest, RequestDraft } from "@/lib/requests/types";
import { useStore } from "@/lib/store";

type Step = "email" | "code" | "publishing" | "failed";

/** Повторний лист — не частіше разу на хвилину, як домовились у плані. */
const RESEND_SECONDS = 60;
const emptyCode = (length = 6) => Array.from({ length }, () => "");

/**
 * Вхід і публікація запиту в одній панелі під полем запиту. Паролів
 * немає: пошта → 6 цифр з листа → готово; або Google. У режимі «publish»
 * після входу одразу публікуємо чернетку, як домовились у плані: «одразу
 * після коду запит публікується». Хто вже увійшов, код не вводить.
 * Опублікований запит стає компактною панеллю на місці поля (components/requests/request-dock),
 * тож окремого екрана «опубліковано» немає: панель просто закривається.
 */
export function AuthPanel({ onPublished }: { onPublished: (request: PublishedRequest) => void }) {
  const flow = useStore(authFlowStore);
  const session = useStore(sessionStore);
  const mode = flow?.mode ?? "login";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(() => emptyCode());
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [draft] = useState<RequestDraft | null>(() => (mode === "publish" ? (loadDraft()?.draft ?? null) : null));
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<{ focus: () => void }>(null);
  const startedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const close = () => {
    if (step !== "publishing") authFlowStore.set(null);
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
      const request = await publishRequest(draft);
      clearDraft();
      onPublished(request);
      addPublishedRequest(request);
      authFlowStore.set(null);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося опублікувати запит.");
      setStep("failed");
    }
  };

  // Хто вже увійшов, одразу публікує; просто «Увійти» для нього не має сенсу.
  useEffect(() => {
    if (startedRef.current || session.status === "loading") return;
    startedRef.current = true;
    if (session.status !== "user") return;
    if (mode === "publish") void publish();
    else {
      authFlowStore.set(null);
      if (mode === "performer") profileEditorStore.set(true);
    }
  }, [session.status]);

  // Форма з'являється в центрі екрана, кроки змінюються з легким зсувом.
  useLayoutEffect(() => {
    if (!panelRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(panelRef.current, { opacity: 0, y: -10, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out" });
    return () => {
      tween.kill();
    };
  }, [mounted]);
  useLayoutEffect(() => {
    if (!bodyRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(bodyRef.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [step, mounted]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const sendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await startEmail(email);
      setMock(result.mock);
      setHint(result.hint ?? null);
      setDigits(emptyCode(result.codeLength));
      setCooldown(RESEND_SECONDS);
      setStep("code");
      window.setTimeout(() => codeRef.current?.focus(), 60);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося надіслати код.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await verifyEmail(email, code);
      if (mode === "publish") await publish();
      else {
        authFlowStore.set(null);
        if (mode === "performer") profileEditorStore.set(true);
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося перевірити код.");
      setDigits(emptyCode(digits.length));
      codeRef.current?.focus();
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

  const googleNext = mode === "publish" ? "/?auth=google" : mode === "performer" ? "/?auth=performer" : "/";
  const googleHref = `/api/auth/google?next=${encodeURIComponent(googleNext)}`;
  const title =
    step === "code"
      ? (mock ? "Код доступу" : "Код з листа")
      : step === "publishing"
        ? "Публікуємо запит"
        : step === "failed"
            ? "Не вдалося опублікувати"
            : mode === "publish"
              ? "Увійдіть, щоб знайти виконавця"
              : mode === "performer"
                ? "Профіль виконавця"
                : "Вхід";

  if (!mounted) return null;

  return createPortal(
    <div className="auth-dialog-layer">
      <div aria-hidden className="auth-dialog-scrim" onClick={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} className="auth-panel glass-panel">
        <div className="auth-dialog-header">
          {step === "code" && (
            <button type="button" onClick={() => setStep("email")} aria-label="Змінити пошту" className="auth-icon-button auth-back">
              <ArrowLeft className="size-4" />
            </button>
          )}
          {step !== "publishing" && (
            <button type="button" onClick={close} aria-label="Закрити" className="auth-icon-button auth-close">
              <X className="size-4" />
            </button>
          )}
          <span className="auth-hero-icon" aria-hidden="true"><MapPin className="size-5" /></span>
          <h2 className="auth-dialog-title">{title}</h2>
        </div>

        <div ref={bodyRef}>
          {step === "email" && (
            <>
              <p className="auth-lead">
                {mode === "publish"
                  ? "Підтвердіть пошту або увійдіть через Google — і ми почнемо шукати виконавця для вашого проєкту."
                  : mode === "performer"
                    ? "Створіть профіль, і замовники знайдуть вас на карті. Пошта й код з листа, без пароля."
                    : "Пошта й код з листа, без пароля. Нова адреса створює новий акаунт."}
              </p>
              <form onSubmit={sendCode} className="grid gap-2.5">
                <label htmlFor="auth-email" className="sr-only">
                  Пошта
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  inputMode="email"
                  placeholder="Електронна пошта"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                  className="auth-input"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? "auth-error" : undefined}
                />
                {error && (
                  <p id="auth-error" role="alert" className="auth-error">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={busy || !email.includes("@")} className="auth-primary">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Увійти або зареєструватися
                </button>
              </form>
              <div className="auth-divider"><span>або</span></div>
              <GoogleButton href={googleHref} onClick={() => draft && saveDraft(draft, true)} />
              <p className="text-center text-[11px] leading-snug text-ink-muted">
                Продовжуючи, ви погоджуєтесь з <a href="/legal/terms" target="_blank" rel="noreferrer" className="auth-link text-[11px]">умовами</a> і{" "}
                <a href="/legal/privacy" target="_blank" rel="noreferrer" className="auth-link text-[11px]">політикою конфіденційності</a>.
              </p>
              {mode === "login" && (
                <p className="text-center text-[12px] text-ink-muted">
                  Хочете, щоб вас знайшли замовники?{" "}
                  <button type="button" onClick={() => authFlowStore.set({ mode: "performer" })} className="auth-link text-[12px]">
                    Я виконавець
                  </button>
                </p>
              )}
            </>
          )}

          {step === "code" && (
            <>
              {mock ? (
                <p className="auth-lead">
                  Тестовий вхід для <strong className="font-semibold text-ink">{email}</strong>. Введіть код доступу, який вам дали.
                </p>
              ) : (
                <p className="auth-lead">
                  Надіслали {digits.length} цифр на <strong className="font-semibold text-ink">{email}</strong>. Код діє 10 хвилин.
                </p>
              )}
              {mock && hint && (
                <p className="auth-mock">
                  Тестовий режим: листи поки не надсилаються. Введіть код <strong>{hint}</strong>.
                </p>
              )}
              <CodeInput ref={codeRef} digits={digits} onChange={onDigits} disabled={busy} invalid={Boolean(error)} />
              <p role="alert" className="auth-error min-h-5 text-center">
                {error ?? (busy ? "Перевіряємо…" : "")}
              </p>
              <div className="flex items-center justify-center gap-1 text-[13px] text-ink-muted">
                Не прийшов лист?
                <button type="button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()} className="auth-link">
                  {cooldown > 0 ? `Надіслати ще раз за ${cooldown} с` : "Надіслати ще раз"}
                </button>
              </div>
            </>
          )}

          {step === "publishing" && (
            <div className="grid justify-items-center gap-3 py-6 text-[13px] text-ink-muted">
              <Loader2 className="size-6 animate-spin text-brand" />
              Показуємо запит виконавцям…
            </div>
          )}

          {step === "failed" && (
            <>
              <p role="alert" className="auth-lead">
                {error}
              </p>
              <button type="button" onClick={() => void publish()} className="auth-primary">
                Спробувати ще раз
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
