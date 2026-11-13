// POST /api/auth/email/start {email} — надіслати 6-значний код.
// Вхід і реєстрація одним кроком: нової адреси не буває «неправильної»,
// відповідь однакова для нової й існуючої.

import { problem, readJson } from "@/lib/api/problem";
import { isValidEmail, normalizeEmail } from "@/lib/auth/config";
import type { EmailStartResult } from "@/lib/auth/types";
import { devCode, startEmailLogin } from "@/lib/server/auth";
import { mailMode } from "@/lib/server/mail";
import { clientIp, failure } from "@/lib/server/route";
import { verifyTurnstile } from "@/lib/server/turnstile";

export const POST = async (request: Request) => {
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) return problem(400, "Некоректна пошта", "Перевірте адресу: схоже, в ній помилка.");
  // Перевірка на ботів іде до обліку спроб: бот не вичерпає ліміт чужої пошти.
  const ip = clientIp(request);
  const human = await verifyTurnstile(body?.turnstileToken, ip);
  if (!human.ok) {
    return human.reason === "invalid"
      ? problem(400, "Перевірка не пройдена", "Не вдалося підтвердити, що ви не робот. Спробуйте ще раз.", "/problems/turnstile")
      : problem(503, "Перевірку не завершено", "Сервіс перевірки зараз недоступний. Спробуйте трохи згодом.", "/problems/turnstile-unavailable");
  }
  try {
    await startEmailLogin(email, ip);
    const dev = mailMode() === "dev" ? devCode() : null;
    const result: EmailStartResult = { sent: true, mock: Boolean(dev), codeLength: dev ? dev.code.length : 6, ...(dev && !dev.private ? { hint: dev.code } : {}) };
    return Response.json(result);
  } catch (error) {
    return failure(error, request);
  }
};
