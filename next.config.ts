// next.config.ts
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Значок dev-режиму Next лягає на кнопку акаунта або масштабу: вимикаємо.
  devIndicators: false,
  // З Next 16.2 `next dev` сам дописує блок у AGENTS.md, коли бачить агента. Єдине джерело правил
  // тут AGENTS.md (RULES-1), тож вимикаємо.
  agentRules: false,
  // Захисні заголовки для `next dev` і сторінок Next; воркер ставить ті самі на всі відповіді (worker/index.ts).
  headers: async () => [{ source: "/:path*", headers: Object.entries(securityHeaders({ dev: process.env.NODE_ENV !== "production", rpcUrl: process.env.CRYPTO_RPC_URL })).map(([key, value]) => ({ key, value })) }],
};

// `next dev` бачить біндинги Cloudflare (D1, R2). Локальна D1 лежить у
// .wrangler/state, тож її треба зберігати між запусками: `persist: false` дає
// порожню базу без таблиць при кожному старті, і весь бекенд відповідає 500.
// Перший раз: `npm run db:migrate:local` і `npm run db:seed:local`.
initOpenNextCloudflareForDev({ environment: "development" });

export default nextConfig;
