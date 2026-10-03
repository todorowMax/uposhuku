// lib/server/google.ts
import { readVar } from "./env";

/** Повертаємо лише на внутрішній шлях: інакше next став би відкритим редіректом. */
export const safeNext = (value: string | null | undefined) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/");

/** Кнопку й вхід вмикаємо, лише коли ID клієнта справжній і є секрет. */
export const googleConfigured = () => (readVar("GOOGLE_CLIENT_ID") ?? "").endsWith(".apps.googleusercontent.com") && Boolean(readVar("GOOGLE_CLIENT_SECRET"));
