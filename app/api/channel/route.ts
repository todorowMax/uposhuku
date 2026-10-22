// GET /api/channel — чи публікуємо запити в Telegram-канал. Публічно: форма запиту
// показує перемикач «У Telegram-каналі» лише тоді, коли канал справді працює.

import { telegramConfig } from "@/lib/telegram/config";

export async function GET() {
  const config = telegramConfig();
  return Response.json({ enabled: config.enabled && config.channelEnabled && Boolean(config.channelId) }, { headers: { "cache-control": "no-store" } });
}
