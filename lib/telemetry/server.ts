// lib/telemetry/server.ts
//
// Єдине місце, де kit/telemetry стикається із застосунком: база, сесія,
// версія збірки. Усе інше в kit про Findlyfy нічого не знає.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "@/lib/server/auth";
import { readVar } from "@/lib/server/env";
import type { KitServerConfig } from "@/kit/telemetry/core";
import { ALLOWED_EVENTS } from "./events";

const context = () => {
  try {
    return getCloudflareContext();
  } catch {
    // Поза воркером (тести, скрипти).
    return null;
  }
};

/**
 * Конфіг kit. Поля, що залежать від середовища, читаємо щоразу, а не під
 * час збирання: застосунок збирається один раз і розкочується в кілька
 * середовищ.
 */
export const telemetryConfig: KitServerConfig = {
  app: "uposhuku",
  get env() {
    return readVar("DEPLOY_ENV") ?? "development";
  },
  get release() {
    return readVar("RELEASE");
  },
  get salt() {
    return readVar("AUTH_SECRET") ?? "uposhuku-dev-salt";
  },
  // Немає привʼязки TELEMETRY_DB: телеметрія мовчки вимкнена, застосунок працює як працював.
  db: () => (globalThis as { __TEST_TELEMETRY_D1?: D1Database }).__TEST_TELEMETRY_D1 ?? context()?.env.TELEMETRY_DB ?? null,
  userId: async () => (await getSessionUser().catch(() => null))?.id ?? null,
  allowedEvents: ALLOWED_EVENTS,
  waitUntil: (work) => {
    const ctx = context()?.ctx;
    if (ctx) ctx.waitUntil(work);
    else void work;
  },
};
