// lib/server/session-secret.ts
//
// Ключ підпису сесій. Чиста функція від змінних середовища, щоб ту саму логіку
// мали і Next-роути (lib/server/auth.ts), і точка входу воркера, що пускає
// WebSocket (worker/index.ts): там немає контексту Next.

export const DEV_ONLY_SECRET = "dev-only-secret-dev-only-secret-dev-only";

/** Ключ або null, коли його немає й це прод (тоді входу немає). */
export const sessionSecret = (env: { AUTH_SECRET?: string; DEPLOY_ENV?: string }): Uint8Array | null => {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 32) return new TextEncoder().encode(env.AUTH_SECRET);
  return env.DEPLOY_ENV === "production" ? null : new TextEncoder().encode(DEV_ONLY_SECRET);
};
