// kit/telemetry/client/providers/noop.ts
import type { AnalyticsProvider } from "../analytics";

/** Заглушка: аналітики немає. Об'єкт, який нічого не робить, замість десятка `if`. */
export const noopProvider: AnalyticsProvider = {
  id: "none",
  init: () => {},
  track: () => {},
  page: () => {},
  identify: () => {},
};
