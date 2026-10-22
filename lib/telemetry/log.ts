// lib/telemetry/log.ts
//
// Запис помилок сервера в журнал kit. Усе «з найкращих зусиль»: не кидає й
// не затримує відповідь.

import { logEvent, trackServer, type LogLevel } from "@/kit/telemetry/core";
import type { EventName } from "./events";
import { telemetryConfig } from "./server";

const pathOf = (request?: Request) => {
  if (!request) return null;
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
};

/** Непередбачена помилка API (500): текст, стек, метод і шлях. */
export const logServerError = (error: unknown, request?: Request, event = "api_error"): void => {
  logServer({
    level: "error",
    event,
    message: error instanceof Error ? error.message : String(error).slice(0, 300),
    detail: { name: error instanceof Error ? error.name : typeof error, stack: error instanceof Error ? error.stack : null, method: request?.method ?? null, path: pathOf(request) },
    request,
  });
};

/** Доменна відмова, яка не баг коду, а «в людини чи в зовнішнього сервісу щось не вийшло». */
export const logServer = (input: { level: LogLevel; event: string; message?: string; detail?: unknown; request?: Request }): void => {
  const work = (async () => {
    try {
      await logEvent(telemetryConfig, {
        level: input.level,
        source: "server",
        event: input.event,
        message: input.message,
        detail: input.detail,
        userId: await telemetryConfig.userId(),
        route: pathOf(input.request),
        userAgent: input.request?.headers.get("user-agent") ?? null,
      });
    } catch {
      // Журнал не має ламати те, що записує.
    }
  })();
  if (telemetryConfig.waitUntil) telemetryConfig.waitUntil(work);
  else void work;
};

/** Серверна подія аналітики зі словника: для кроків, які не має права загубити блокувальник. */
export const serverEvent = (name: EventName, props: Record<string, unknown> | undefined, userId: string | null, path?: string | null): void =>
  trackServer(telemetryConfig, name, props, { userId, path });
