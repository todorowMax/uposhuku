// POST /api/csp-report — отчёти браузера про порушення Content-Security-Policy-Report-Only.
// Публічний маршрут: лишає в журналі лише суть (директива, заблокований хост, сторінка), обмежений за частотою й розміром.

import { clientIp } from "@/lib/server/route";
import { overLimit } from "@/lib/server/rate-limit";
import { logServer } from "@/lib/telemetry/log";

const MAX_BODY = 4_000;
const origin = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).origin;
  } catch {
    return value.slice(0, 40);
  }
};

export const POST = async (request: Request) => {
  const text = (await request.text()).slice(0, MAX_BODY);
  if (!(await overLimit("cspReport", clientIp(request)))) {
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const report = (body["csp-report"] ?? body) as Record<string, unknown>;
      logServer({
        level: "warn",
        event: "csp_report",
        message: "Порушення CSP (Report-Only)",
        detail: { directive: report["violated-directive"] ?? report.effectiveDirective ?? null, blocked: origin(report["blocked-uri"] ?? report.blockedURL), page: origin(report["document-uri"] ?? report.documentURL) },
      });
    } catch {
      // Не JSON: ігноруємо.
    }
  }
  return new Response(null, { status: 204 });
};
