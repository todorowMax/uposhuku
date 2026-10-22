// POST /api/internal/tick — фонові задачі, які викликає cron воркера (раз на 5 хвилин):
// пости запитів у Telegram-канал, редагування закритих, прибирання старого.
// Захист: заголовок Authorization: Bearer <INTERNAL_TOKEN>, звіряється за сталий час.

import { and, lt } from "drizzle-orm";
import { notificationLog } from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { readVar } from "@/lib/server/env";
import { pruneTelegram } from "@/lib/server/telegram-repo";
import { closeFinishedPosts, postDueRequests } from "@/lib/telegram/channel";
import { logServer } from "@/lib/telemetry/log";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const sameSecret = (given: string, expected: string): boolean => {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
};

export async function POST(request: Request) {
  const expected = readVar("INTERNAL_TOKEN");
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !sameSecret(given, expected)) return new Response(null, { status: 401 });
  try {
    const now = Date.now();
    const posted = await postDueRequests(now);
    const closed = await closeFinishedPosts(now);
    await pruneTelegram(now);
    await getDb().delete(notificationLog).where(and(lt(notificationLog.createdAt, now - WEEK_MS)));
    return Response.json({ ok: true, ...posted, closed });
  } catch (error) {
    logServer({ level: "error", event: "tick_failed", message: error instanceof Error ? error.message : String(error), detail: { stack: error instanceof Error ? error.stack : null } });
    return Response.json({ ok: false }, { status: 500 });
  }
}
