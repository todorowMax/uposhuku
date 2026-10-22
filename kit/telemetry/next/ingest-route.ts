// kit/telemetry/next/ingest-route.ts
//
// Приймає пачки подій аналітики з браузера.
//
//   // app/api/k/e/route.ts
//   export const { POST } = createIngestRoute(telemetryConfig);

import { EVENT_NAME, hashIp, hit, insertEvents, MINUTE, parseUserAgent, refererDomain, sanitizeProps, type EventRow, type KitServerConfig } from "../core";
import { clip } from "../core/serialize";
import { clientIp, countryOf, readBody } from "./request";

const MAX_BODY = 16 * 1024;
const MAX_EVENTS = 25;
/** Скільки подій з однієї адреси за десять хвилин. */
export const INGEST_LIMIT = 300;
const ID = /^[\w-]{6,64}$/;
const DAY_MS = 24 * 60 * MINUTE;

const empty = () => new Response(null, { status: 204 });

export const createIngestRoute = (config: KitServerConfig) => ({
  async POST(request: Request): Promise<Response> {
    try {
      const db = config.db();
      if (!db) return empty();

      const ua = parseUserAgent(request.headers.get("user-agent"));
      // Боти рахувати нема чого: вони б лише спотворили воронки.
      if (ua.bot) return empty();

      const parsed = await readBody(request, MAX_BODY);
      if (!parsed.ok) return parsed.reason === "too_large" ? new Response(null, { status: 413 }) : empty();
      const { body } = parsed;
      if (!Array.isArray(body.events) || body.events.length === 0) return empty();
      const incoming = body.events.slice(0, MAX_EVENTS);

      const ipHash = await hashIp(clientIp(request), config.salt);
      if (!(await hit(db, `ev:ip:${ipHash}`, 10 * MINUTE, INGEST_LIMIT, incoming.length))) return empty();

      const userId = await config.userId().catch(() => null);
      const now = Date.now();
      // Годинник телефона може йти як завгодно: час події рахуємо від моменту відправки.
      const sentAt = typeof body.sentAt === "number" && Number.isFinite(body.sentAt) ? body.sentAt : now;
      const offset = now - sentAt;
      const internal = body.internal === true;
      // Перехід зі своєї ж сторінки (перезавантаження) нічого не каже про те, звідки прийшли.
      const rawReferrer = refererDomain(body.referrer);
      const referrer = rawReferrer && rawReferrer !== new URL(request.url).hostname ? rawReferrer : null;
      const utm = body.utm && typeof body.utm === "object" ? (body.utm as Record<string, unknown>) : {};
      const country = countryOf(request);

      const rows: EventRow[] = [];
      for (const raw of incoming) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        const name = item.name;
        if (typeof name !== "string" || !EVENT_NAME.test(name)) continue;
        if (config.allowedEvents && !config.allowedEvents.has(name)) continue;
        if (typeof item.id !== "string" || !ID.test(item.id)) continue;
        if (typeof item.sessionId !== "string" || !ID.test(item.sessionId)) continue;
        const clientTs = typeof item.ts === "number" && Number.isFinite(item.ts) ? item.ts : sentAt;
        rows.push({
          id: item.id,
          ts: Math.min(Math.max(clientTs + offset, now - DAY_MS), now + MINUTE),
          name,
          props: sanitizeProps(item.props),
          source: "client",
          userId,
          anonId: typeof item.anonId === "string" && ID.test(item.anonId) ? item.anonId : null,
          sessionId: item.sessionId,
          path: clip(item.path, 200),
          referrer,
          utmSource: clip(utm.source, 64),
          utmMedium: clip(utm.medium, 64),
          utmCampaign: clip(utm.campaign, 64),
          device: ua.device,
          browser: ua.browser,
          os: ua.os,
          country,
          internal,
        });
      }
      await insertEvents(db, rows, { release: config.release, receivedAt: now });
      return empty();
    } catch {
      // Аналітика не має ламати застосунок і не показує людині нічого.
      return empty();
    }
  },
});
