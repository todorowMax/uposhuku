// lib/server/env.ts
//
// Привʼязки й секрети Cloudflare. У воркері вони в getCloudflareContext().env,
// локально `next dev` дає ті самі через initOpenNextCloudflareForDev, а
// змінні процесу — запасний шлях для тестів.

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const readVar = (name: keyof CloudflareEnv): string | undefined => {
  try {
    const value = (getCloudflareContext().env as unknown as Record<string, unknown>)[name];
    if (typeof value === "string" && value) return value;
  } catch {
    // Поза контекстом воркера (тести, скрипти).
  }
  return process.env[name];
};

export const isProduction = () => readVar("DEPLOY_ENV") === "production";
