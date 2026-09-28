// next.config.ts
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// Той самий шлях, що в mealcart: `next dev` бачить біндинги Cloudflare,
// коли вони з'являться (D1, R2). Зараз їх немає, виклик нічого не ламає.
initOpenNextCloudflareForDev({ environment: "development" });

export default nextConfig;
