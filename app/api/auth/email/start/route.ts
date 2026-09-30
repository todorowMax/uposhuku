// POST /api/auth/email/start {email} — надіслати 6-значний код.
// Вхід і реєстрація одним кроком: нової адреси не буває «неправильної»,
// відповідь однакова для нової й існуючої. Зараз заглушка: лист не йде,
// код — MOCK_CODE (lib/auth/config.ts).

import { problem, readJson } from "@/lib/api/problem";
import { authMode, isValidEmail, normalizeEmail } from "@/lib/auth/config";
import type { EmailStartResult } from "@/lib/auth/types";

export async function POST(request: Request) {
  if (authMode() === "off") return problem(503, "Вхід ще не підключено", "Спробуйте трохи згодом.");
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) return problem(400, "Некоректна пошта", "Перевірте адресу: схоже, в ній помилка.");
  const result: EmailStartResult = { sent: true, mock: true };
  return Response.json(result);
}
