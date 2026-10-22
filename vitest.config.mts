import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Тести репозиторіїв піднімають справжні D1 й R2 (miniflare): на завантаженій машині це довше за 10 с.
    hookTimeout: 90_000,
    testTimeout: 30_000,
  },
});
