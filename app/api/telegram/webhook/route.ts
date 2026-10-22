// POST /api/telegram/webhook — сюди Telegram шле оновлення бота.
//
// Захист: заголовок `x-telegram-bot-api-secret-token` має збігтися з
// TELEGRAM_WEBHOOK_SECRET (звіряємо за сталий час). Оновлення, які вже
// обробляли (`update_id`), ігноруємо: вебхук можуть повторити. Відповідаємо
// одразу 200, а обробка добігає після відповіді.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { seenUpdate } from "@/lib/server/telegram-repo";
import { handleUpdate } from "@/lib/telegram/handle-update";
import { telegramConfig } from "@/lib/telegram/config";
import type { TgUpdate } from "@/lib/telegram/types";

/** Порівняння за сталий час: довжина відома, а за вмістом не вгадати по часу відповіді. */
const sameSecret = (given: string, expected: string): boolean => {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
};

export async function POST(request: Request) {
  const config = telegramConfig();
  if (!config.enabled || !config.webhookSecret) return new Response(null, { status: 404 });
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!sameSecret(given, config.webhookSecret)) return new Response(null, { status: 401 });

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response(null, { status: 200 });
  }
  if (typeof update?.update_id !== "number") return new Response(null, { status: 200 });
  if (await seenUpdate(update.update_id)) return new Response(null, { status: 200 });

  const work = handleUpdate(update);
  // У воркері відповідаємо одразу, а обробка добігає після відповіді. Поза воркером (тести, локально) чекаємо.
  let ctx: ExecutionContext | null = null;
  try {
    ctx = getCloudflareContext().ctx;
  } catch {
    ctx = null;
  }
  if (ctx) ctx.waitUntil(work);
  else await work;
  return new Response(null, { status: 200 });
}

