// lib/server/turnstile.ts
//
// Перевірка Cloudflare Turnstile на вході (відправка коду). Браузер дає токен віджета, сервер перевіряє його
// у siteverify: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/.
// Токен одноразовий і живе 5 хвилин. Ключі: TURNSTILE_SITE_KEY (публічний, віддаємо клієнту) і TURNSTILE_SECRET.
// Без обох перевірка вимкнена (локально, тести); на проді без ключів це попередження в журналі, вхід не ламаємо.
// Тестові ключі Cloudflare (завжди проходить): site 1x00000000000000000000AA, secret 1x0000000000000000000000000000000AA.

import { TURNSTILE_ACTION } from "@/lib/auth/config";
import { logServer } from "@/lib/telemetry/log";
import { isProduction, readVar } from "./env";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 10_000;

export type TurnstileResult = { ok: true; skipped: boolean } | { ok: false; reason: "invalid" | "unavailable" };

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  "error-codes"?: string[];
}

/** Публічний ключ для віджета; null, якщо перевірка не налаштована повністю (потрібні обидва ключі). */
export const turnstileSiteKey = (): string | null => {
  const siteKey = readVar("TURNSTILE_SITE_KEY")?.trim();
  return siteKey && readVar("TURNSTILE_SECRET")?.trim() ? siteKey : null;
};

let warned = false;
const warnOnce = () => {
  if (warned || !isProduction()) return;
  warned = true;
  logServer({ level: "warn", event: "turnstile_not_configured", message: "TURNSTILE_SITE_KEY і TURNSTILE_SECRET не задані: вхід без перевірки на ботів" });
};

/** Токен із запиту як рядок допустимої довжини; усе інше null. */
export const readTurnstileToken = (value: unknown): string | null => (typeof value === "string" && value.length > 0 && value.length <= MAX_TOKEN_LENGTH ? value : null);

/** `skipped`: ключів немає, нічого не питали. `unavailable`: siteverify не відповів, тож закрито (не пускаємо без перевірки). */
export const verifyTurnstile = async (token: unknown, ip: string): Promise<TurnstileResult> => {
  if (!turnstileSiteKey()) {
    warnOnce();
    return { ok: true, skipped: true };
  }
  const response = readTurnstileToken(token);
  if (!response) return { ok: false, reason: "invalid" };
  try {
    const reply = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: new URLSearchParams({ secret: readVar("TURNSTILE_SECRET") as string, response, ...(ip && ip !== "local" ? { remoteip: ip } : {}) }),
    });
    if (!reply.ok) throw new Error(`siteverify ${reply.status}`);
    const result = (await reply.json()) as SiteverifyResponse;
    // Тестові ключі Cloudflare не повертають `action`: звіряємо, лише коли вона є.
    if (!result.success || (result.action !== undefined && result.action !== TURNSTILE_ACTION)) return { ok: false, reason: "invalid" };
    return { ok: true, skipped: false };
  } catch (error) {
    logServer({ level: "error", event: "turnstile_unavailable", message: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "unavailable" };
  }
};
