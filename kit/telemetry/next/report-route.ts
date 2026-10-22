// kit/telemetry/next/report-route.ts
//
// Приймає помилки з браузера. Відкритий і для гостей: карта доступна без
// входу, і саме там ламається найбільше. Від залпу захищають ліміти.
//
//   // app/api/k/r/route.ts
//   export const { POST } = createReportRoute(telemetryConfig);

import { hashIp, hit, HOUR, logEvent, type KitServerConfig } from "../core";
import { clip } from "../core/serialize";
import { clientIp, countryOf, readBody } from "./request";

const MAX_BODY = 16 * 1024;
/** Скільки звітів за годину: від людини, від гостя з однієї адреси й від усього застосунку. */
export const REPORT_LIMITS = { user: 40, ip: 20, app: 2000 } as const;
const EVENT_CODE = /^[a-z][a-z0-9_]*$/;
const ID = /^[\w-]{6,64}$/;

export const createReportRoute = (config: KitServerConfig) => ({
  async POST(request: Request): Promise<Response> {
    // Завжди 200: клієнт ніколи не показує людині помилку про помилку.
    const ok = (extra: Record<string, unknown> = {}) => Response.json({ ok: true, ...extra });
    try {
      const db = config.db();
      if (!db) return ok();

      const parsed = await readBody(request, MAX_BODY);
      if (!parsed.ok) return parsed.reason === "too_large" ? new Response(null, { status: 413 }) : ok();
      const { body } = parsed;

      const userId = await config.userId().catch(() => null);
      const ipHash = await hashIp(clientIp(request), config.salt);

      const allowed =
        (await hit(db, userId ? `err:u:${userId}` : `err:ip:${ipHash}`, HOUR, userId ? REPORT_LIMITS.user : REPORT_LIMITS.ip)) &&
        (await hit(db, "err:app", HOUR, REPORT_LIMITS.app));
      if (!allowed) return ok({ throttled: true });

      const event = typeof body.event === "string" && body.event.length <= 64 && EVENT_CODE.test(body.event) ? body.event : "client_error";
      const detail = body.detail && typeof body.detail === "object" ? { ...(body.detail as Record<string, unknown>) } : body.detail === undefined ? {} : { value: body.detail };
      if (Array.isArray(body.breadcrumbs)) (detail as Record<string, unknown>).breadcrumbs = body.breadcrumbs.slice(-20);

      await logEvent(config, {
        level: body.level === "warn" ? "warn" : "error",
        source: "client",
        event,
        message: clip(body.message, 500) ?? "",
        detail,
        // Ідентифікатор людини лише із сесії; те, що прислав клієнт, не береться.
        userId,
        anonId: typeof body.anonId === "string" && ID.test(body.anonId) ? body.anonId : null,
        sessionId: typeof body.sessionId === "string" && ID.test(body.sessionId) ? body.sessionId : null,
        ipHash,
        route: clip(body.route, 200),
        userAgent: request.headers.get("user-agent"),
        country: countryOf(request),
      });
      return ok();
    } catch {
      return ok();
    }
  },
});
