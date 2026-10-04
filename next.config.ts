// next.config.ts
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Значок dev-режиму Next лягає на кнопку акаунта або масштабу: вимикаємо.
  devIndicators: false,
};

// `next dev` бачить біндинги Cloudflare (D1, R2). Локальна D1 лежить у
// .wrangler/state, тож її треба зберігати між запусками: `persist: false` дає
// порожню базу без таблиць при кожному старті, і весь бекенд відповідає 500.
// Перший раз: `npm run db:migrate:local` і `npm run db:seed:local`.
initOpenNextCloudflareForDev({ environment: "development" });

export default nextConfig;
