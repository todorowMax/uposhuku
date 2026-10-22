// POST /api/auth/email/verify {email, code} — перевірити код і відкрити сесію.

import { problem, readJson } from "@/lib/api/problem";
import { isValidEmail, normalizeEmail } from "@/lib/auth/config";
import { verifyEmailLogin } from "@/lib/server/auth";
import { clientIp, failure } from "@/lib/server/route";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";

export async function POST(request: Request) {
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!isValidEmail(email)) return problem(400, "Некоректна пошта");
  if (!/^\d{4,8}$/.test(code)) return problem(400, "Невірний код", "Невірний код. Спробуйте ще раз.", "/problems/invalid-code");
  try {
    const user = await verifyEmailLogin(email, code, clientIp(request));
    serverEvent(EVENTS.authCompleted, { method: "email" }, user.id, "/api/auth/email/verify");
    return Response.json({ user });
  } catch (error) {
    return failure(error, request);
  }
}
