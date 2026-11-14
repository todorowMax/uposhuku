// POST /api/phone/start — почати підтвердження телефона через бота.
// Telegram уже підключено: бот пише в чат із кнопкою «Поділитися номером» → { started: true, botUrl }.
// Не підключено: токен прив'язки з призначенням «phone» → { started: false, linkUrl }; після Start бот сам проситиме номер.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { phoneKey } from "@/lib/server/phone-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { activeLink, createLinkToken } from "@/lib/server/telegram-repo";
import { sendMessage } from "@/lib/telegram/api";
import { botLink, telegramConfig } from "@/lib/telegram/config";
import { contactKeyboard } from "@/lib/telegram/handle-update";
import { TEXTS } from "@/lib/telegram/texts";
import { logServer } from "@/lib/telemetry/log";

export const POST = async () => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const limited = await rateLimited("phoneStart", user.id);
  if (limited) return limited;
  const config = telegramConfig();
  if (!config.enabled || !config.username) return problem(503, "Telegram ще не підключено", "Підтвердження телефона з'явиться трохи згодом.");
  // Без ключа хешу номер підтвердити не можна: краще сказати зараз, ніж після того, як людина поділиться номером.
  if (!phoneKey()) return problem(503, "Підтвердження телефона недоступне", "Спробуйте трохи згодом.");

  const link = await activeLink(user.id);
  if (!link) {
    const { token } = await createLinkToken(user.id, Date.now(), "phone");
    return Response.json({ started: false, linkUrl: botLink(config, token) });
  }
  try {
    await sendMessage(link.chatId, TEXTS.phoneAsk, { keyboard: contactKeyboard() });
  } catch (error) {
    logServer({ level: "warn", event: "phone_start_failed", message: error instanceof Error ? error.message : String(error), detail: { userId: user.id } });
    return problem(502, "Бот не відповів", "Не вдалося написати в Telegram. Спробуйте ще раз трохи згодом.");
  }
  return Response.json({ started: true, botUrl: botLink(config) });
};
