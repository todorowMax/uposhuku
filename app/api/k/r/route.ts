// /api/k/r — помилки з браузера (kit/telemetry). Нейтральна адреса: правила
// блокувальників ріжуть усе зі словами log, track, analytics.
import { createReportRoute } from "@/kit/telemetry/next/report-route";
import { telemetryConfig } from "@/lib/telemetry/server";

export const { POST } = createReportRoute(telemetryConfig);
