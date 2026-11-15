import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname },
  },
  test: {
    // Тести репозиторіїв піднімають справжні D1 й R2 (miniflare): на завантаженій машині це довше за 10 с.
    hookTimeout: 90_000,
    testTimeout: 30_000,
    projects: [
      // Чиста логіка, репозиторії й маршрути: Node.
      { extends: true, test: { name: "unit", environment: "node", include: ["tests/unit/**/*.test.ts"] } },
      // Хуки React: jsdom і @testing-library/react.
      { extends: true, test: { name: "hooks", environment: "jsdom", include: ["tests/hooks/**/*.test.tsx"] } },
    ],
  },
});
