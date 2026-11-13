// lib/auth/turnstile-client.ts
//
// Браузерна частина Cloudflare Turnstile: ключ віджета з сервера й завантаження api.js (один раз на сторінку).
// Явний рендер (`render=explicit`): віджет створює хук `components/auth/use-turnstile.ts`, коли панель входу відкрита.
// Скрипт беремо лише за цією адресою, без проксі й кешу: так вимагає документація Cloudflare.

export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  theme: "auto";
  size: "flexible";
  appearance: "interaction-only";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

export interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Підключає api.js і чекає, поки з'явиться `window.turnstile`. Невдача скидає кеш, щоб наступна спроба пішла знову. */
export const loadTurnstile = (): Promise<TurnstileApi> => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)?.remove();
    throw error;
  });
  return loading;
};

/** Публічний ключ віджета; null, якщо перевірку не ввімкнено (або запит не вдався: сервер сам відмовить, коли вона потрібна). */
export const fetchTurnstileSiteKey = async (): Promise<string | null> => {
  try {
    const response = await fetch("/api/auth/turnstile", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { siteKey?: unknown };
    return typeof data.siteKey === "string" && data.siteKey ? data.siteKey : null;
  } catch {
    return null;
  }
};
