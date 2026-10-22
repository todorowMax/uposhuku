// /api/k/e — пачки подій аналітики з браузера (kit/telemetry).
import { createIngestRoute } from "@/kit/telemetry/next/ingest-route";
import { telemetryConfig } from "@/lib/telemetry/server";

export const { POST } = createIngestRoute(telemetryConfig);
