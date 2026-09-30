// POST /api/auth/email/verify {email, code} — перевірити код і відкрити сесію.
// Справжня версія: SHA-256 від userId:код у D1, 10 хвилин, 5 спроб.

import { problem, readJson } from "@/lib/api/problem";
import { MOCK_CODE, authMode, isValidEmail, normalizeEmail } from "@/lib/auth/config";
import { createMockUser, setMockSession } from "@/lib/auth/mock-session";

export async function POST(request: Request) {
  if (authMode() === "off") return problem(503, "Вхід ще не підключено", "Спробуйте трохи згодом.");
  const body = await readJson(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!isValidEmail(email)) return problem(400, "Некоректна пошта");
  if (!/^\d{6}$/.test(code) || code !== MOCK_CODE) {
    return problem(400, "Невірний код", "Невірний код. Спробуйте ще раз.", "/problems/invalid-code");
  }
  const user = await createMockUser(email, "email");
  await setMockSession(user);
  return Response.json({ user });
}
