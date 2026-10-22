// /api/telegram/link — прив'язка акаунта до Telegram.
// GET — стан; POST — одноразове посилання на бота (живе 15 хвилин); DELETE — відключити.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { pushUser } from "@/lib/server/realtime";
import { createLinkToken, deactivateByUser, getLink } from "@/lib/server/telegram-repo";
import { sendMessage } from "@/lib/telegram/api";
import { botLink, telegramConfig } from "@/lib/telegram/config";
import { TEXTS } from "@/lib/telegram/texts";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const config = telegramConfig();
  const link = await getLink(user.id);
  return Response.json(
    {
      /** Бот налаштований: без цього кнопку «Підключити» не показуємо. */
      available: config.enabled && Boolean(config.username),
      linked: Boolean(link?.active),
      username: link?.active ? link.username : null,
      blocked: Boolean(link && !link.active && link.blockedAt),
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const config = telegramConfig();
  if (!config.enabled || !config.username) return problem(503, "Telegram ще не підключено", "Сповіщення в Telegram з'являться трохи згодом.");
  const { token, expiresAt } = await createLinkToken(user.id);
  return Response.json({ url: botLink(config, token), expiresAt });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const link = await deactivateByUser(user.id);
  if (link) {
    // Бот прощається, щоб людина бачила в чаті, що сповіщень більше не буде.
    await sendMessage(link.chatId, TEXTS.stopped).catch(() => {});
    serverEvent(EVENTS.telegramUnlinked, { by: "site" }, user.id, "/api/telegram/link");
    pushUser(user.id, { t: "telegram" });
  }
  return new Response(null, { status: 204 });
}
