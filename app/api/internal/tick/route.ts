// POST /api/internal/tick — фонові задачі, які викликає cron воркера (раз на 5 хвилин):
// пости запитів у Telegram-канал, редагування закритих, прибирання старого.
// Захист: заголовок Authorization: Bearer <INTERNAL_TOKEN>, звіряється за сталий час.

import { and, lt } from "drizzle-orm";
import { authAttempts, notificationLog } from "@/db/schema";
import { runDealSweep } from "@/lib/server/deal-sweep";
import { getDb } from "@/lib/server/db";
import { readVar } from "@/lib/server/env";
import { pruneTelegram } from "@/lib/server/telegram-repo";
import { closeFinishedPosts, postDueRequests } from "@/lib/telegram/channel";
import { logServer } from "@/lib/telemetry/log";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ATTEMPTS_KEEP_MS = 2 * 60 * 60 * 1000;

const sameSecret = (given: string, expected: string): boolean => {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
};

export const POST = async (request: Request) => {
  const expected = readVar("INTERNAL_TOKEN");
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !sameSecret(given, expected)) return new Response(null, { status: 401 });
  const now = Date.now();
  const failed: string[] = [];
  // Кожен крок у своєму try/catch: збій одного не скасовує решту, а потрапляє в журнал і у відповідь.
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (error) {
      failed.push(name);
      logServer({ level: "error", event: "tick_step_failed", message: error instanceof Error ? error.message : String(error), detail: { step: name, stack: error instanceof Error ? error.stack : null } });
      return null;
    }
  };
  // Звірка грошей безпечної угоди йде першою: її не повинні зачепити збої Telegram чи прибирання.
  const sweep = await step("sweep", () => runDealSweep(now));
  const posted = await step("post", () => postDueRequests(now));
  const closed = await step("close", () => closeFinishedPosts(now));
  await step("prune_telegram", () => pruneTelegram(now));
  await step("prune_notifications", () => getDb().delete(notificationLog).where(and(lt(notificationLog.createdAt, now - WEEK_MS))));
  // Лічильники спроб і частоти потрібні лише на своє вікно (найдовше година).
  await step("prune_attempts", () => getDb().delete(authAttempts).where(lt(authAttempts.createdAt, now - ATTEMPTS_KEEP_MS)));
  const sweepFailed = failed.includes("sweep");
  return Response.json({ ok: failed.length === 0, failed, ...posted, closed, sweep }, { status: sweepFailed ? 500 : 200 });
};
