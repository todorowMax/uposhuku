// lib/server/google.ts
import { readVar } from "./env";

const NEXT_BASE = "https://next.invalid";

/**
 * Повертаємо лише на внутрішній шлях. Браузер читає `\` як `/` і викидає табуляції та переводи рядка, тож
 * `/\evil.example` чи `/<TAB>/evil.example` після розбору ведуть на чужий хост: перевіряємо результат розбору, а не початок рядка.
 */
export const safeNext = (value: string | null | undefined) => {
  if (!value || !value.startsWith("/")) return "/";
  try {
    const url = new URL(value, NEXT_BASE);
    return url.origin === NEXT_BASE ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
};

/** Кнопку й вхід вмикаємо, лише коли ID клієнта справжній і є секрет. */
export const googleConfigured = () => (readVar("GOOGLE_CLIENT_ID") ?? "").endsWith(".apps.googleusercontent.com") && Boolean(readVar("GOOGLE_CLIENT_SECRET"));
