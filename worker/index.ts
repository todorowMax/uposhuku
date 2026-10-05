// worker/index.ts
//
// Точка входу воркера. Усе, крім WebSocket, віддаємо згенерованому OpenNext
// воркеру з Next усередині, а `/api/realtime/*` обробляємо тут: перевіряємо
// сесію й передаємо апгрейд у Durable Object. Окремий вхід потрібен, бо клас
// Durable Object має експортуватися з головного модуля воркера.

import { jwtVerify } from "jose";
import { sessionSecret } from "../lib/server/session-secret";
// @ts-expect-error: файл створює збірка OpenNext (npm run cf:build)
import openNext from "../.open-next/worker.js";

export { Realtime } from "./realtime";

const IDLE_TTL = 14 * 24 * 60 * 60 * 1000;

const cookieValue = (header: string | null, name: string) => header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];

/** Хто за сокетом: той самий JWT і рядок у `sessions`, що й в API. Без сесії null. */
const sessionUserId = async (request: Request, env: CloudflareEnv): Promise<string | null> => {
  const token = cookieValue(request.headers.get("cookie"), "vm_session");
  const key = sessionSecret(env);
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.jti || !payload.sub) return null;
    const row = await env.DB.prepare("select user_id, expires_at, last_seen_at from sessions where id = ?").bind(payload.jti).first<{ user_id: string; expires_at: number; last_seen_at: number }>();
    const now = Date.now();
    if (!row || row.user_id !== payload.sub || row.expires_at < now || now - row.last_seen_at > IDLE_TTL) return null;
    return row.user_id;
  } catch {
    return null;
  }
};

const realtime = async (request: Request, env: CloudflareEnv): Promise<Response> => {
  if (request.headers.get("Upgrade") !== "websocket") return new Response("Потрібен WebSocket", { status: 426 });
  // Захист від чужих сторінок: сокет відкриваємо лише зі свого походження.
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== url.host) return new Response("Заборонено", { status: 403 });

  // Заголовок x-rt-user ставимо лише ми: з клієнта він не береться, тож підробити, чий це сокет, не вийде.
  const headers = new Headers(request.headers);
  headers.delete("x-rt-user");
  let room = "global";
  if (url.pathname === "/api/realtime/me") {
    const userId = await sessionUserId(request, env);
    if (!userId) return new Response("Потрібен вхід", { status: 401 });
    room = `user:${userId}`;
    headers.set("x-rt-user", userId);
  } else if (url.pathname !== "/api/realtime/global") {
    return new Response("Не знайдено", { status: 404 });
  }
  return env.REALTIME.get(env.REALTIME.idFromName(room)).fetch(new Request(request, { headers }));
};

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/realtime/")) return realtime(request, env);
    return openNext.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<CloudflareEnv>;
