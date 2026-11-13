// lib/auth/config.ts
//
// У якому режимі працює вхід. Поки немає D1 і Resend, увесь вхід — заглушка:
// лист не надсилається, код завжди MOCK_CODE, сесія — cookie без підпису.
// Заглушку вмикаємо лише локально й на dev-воркері: на проді з кодом
// 000000 зайшов би будь-хто, тож там вхід просто вимкнений, доки не
// підключимо справжній (див. «Фундамент» у docs/plan-mvp.md).

import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Код, який приймає заглушка. */
export const MOCK_CODE = "000000";

const readVar = (name: string): string | undefined => {
  try {
    const { env } = getCloudflareContext();
    return (env as unknown as Record<string, string | undefined>)[name];
  } catch {
    return process.env[name];
  }
};

export type AuthMode = "mock" | "off";

export const authMode = (): AuthMode =>
  process.env.NODE_ENV !== "production" || readVar("DEPLOY_ENV") === "development" ? "mock" : "off";

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

/** Дія віджета Turnstile на відправці коду: сервер звіряє її з відповіддю siteverify. */
export const TURNSTILE_ACTION = "login";

/** Сесія без жодного звернення довше цього часу мертва (її не приймає `getSessionUser`); tick прибирає такі рядки. */
export const SESSION_IDLE_MS = 14 * 24 * 60 * 60 * 1000;
