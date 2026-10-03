// POST /api/auth/email/verify {email, code} — перевірити код і відкрити сесію.

import { problem, readJson } from "@/lib/api/problem";
import { isValidEmail, normalizeEmail } from "@/lib/auth/config";
import { verifyEmailLogin } from "@/lib/server/auth";
import { failure } from "@/lib/server/route";

export async function POST(request: Request) {
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!isValidEmail(email)) return problem(400, "Некоректна пошта");
  if (!/^\d{6}$/.test(code)) return problem(400, "Невірний код", "Невірний код. Спробуйте ще раз.", "/problems/invalid-code");
  try {
    return Response.json({ user: await verifyEmailLogin(email, code) });
  } catch (error) {
    return failure(error);
  }
}
