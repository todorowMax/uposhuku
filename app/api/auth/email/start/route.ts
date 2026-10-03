// POST /api/auth/email/start {email} — надіслати 6-значний код.
// Вхід і реєстрація одним кроком: нової адреси не буває «неправильної»,
// відповідь однакова для нової й існуючої.

import { problem, readJson } from "@/lib/api/problem";
import { isValidEmail, normalizeEmail } from "@/lib/auth/config";
import type { EmailStartResult } from "@/lib/auth/types";
import { devCode, startEmailLogin } from "@/lib/server/auth";
import { mailMode } from "@/lib/server/mail";
import { clientIp, failure } from "@/lib/server/route";

export async function POST(request: Request) {
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) return problem(400, "Некоректна пошта", "Перевірте адресу: схоже, в ній помилка.");
  try {
    await startEmailLogin(email, clientIp(request));
    const dev = mailMode() === "dev" ? devCode() : null;
    const result: EmailStartResult = { sent: true, mock: Boolean(dev), codeLength: dev ? dev.code.length : 6, ...(dev && !dev.private ? { hint: dev.code } : {}) };
    return Response.json(result);
  } catch (error) {
    return failure(error);
  }
}
