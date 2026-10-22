"use client";

// kit/telemetry/client/consent.ts
//
// Згода на статистику.
//
//   granted — події летять із ідентифікатором пристрою, сесія постійна;
//   unknown — людина ще не відповіла: події летять, але без ідентифікатора
//             пристрою, сесія лише в пам'яті вкладки;
//   denied  — нічого не шлемо.
//
// Сигнал Global Privacy Control вважаємо відмовою, доки людина сама не
// натисне «Добре». Рішення живе в localStorage, а не в куці: сервер його
// не читає, тож куку довелося б згадувати в ній самій.

import { safeStorage } from "./config";

export type Consent = "granted" | "denied" | "unknown";

export const CONSENT_CHANGED = "kit:consent-changed";

const storage = () => safeStorage("local");

/** Що людина вибрала сама; `null`, якщо ще ні. */
export const readStoredConsent = (): "granted" | "denied" | null => {
  if (typeof window === "undefined") return null;
  const value = storage().read("consent");
  return value === "granted" || value === "denied" ? value : null;
};

export const gpcEnabled = (): boolean => typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

/** Чинна згода: власний вибір сильніший за GPC. */
export const getConsent = (): Consent => {
  const stored = readStoredConsent();
  if (stored) return stored;
  return gpcEnabled() ? "denied" : "unknown";
};

/** Показувати банер: вибору немає, і браузер не сказав «не стежити». */
export const shouldAskConsent = (): boolean => readStoredConsent() === null && !gpcEnabled();

export const writeConsent = (value: "granted" | "denied"): void => {
  storage().write("consent", value);
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED, { detail: value }));
};

export const onConsentChange = (listener: (consent: Consent) => void): (() => void) => {
  const handler = () => listener(getConsent());
  window.addEventListener(CONSENT_CHANGED, handler);
  return () => window.removeEventListener(CONSENT_CHANGED, handler);
};
