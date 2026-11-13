// POST /api/auth/email/verify {email, code, accepted?} — перевірити код і відкрити сесію.
// Новому користувачу (і тому, хто не приймав чинні умови) потрібен `accepted: true`, інакше 400 до перевірки коду.
// Згоду з умовами й політикою записуємо після успішного входу (джерело `signup`).

import { problem, readJson } from "@/lib/api/problem";
import { REQUIRED_DOCS } from "@/lib/legal/acceptance";
import { isValidEmail, normalizeEmail } from "@/lib/auth/config";
import { verifyEmailLogin } from "@/lib/server/auth";
import { termsRequired } from "@/lib/server/legal-gate";
import { needsTermsAcceptance, recordAcceptance } from "@/lib/server/legal-repo";
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
    const needsTerms = await needsTermsAcceptance({ email });
    if (needsTerms && body?.accepted !== true) return termsRequired();
    const user = await verifyEmailLogin(email, code, clientIp(request));
    if (needsTerms) await recordAcceptance({ userId: user.id, docs: REQUIRED_DOCS, source: "signup", ip: clientIp(request) });
    serverEvent(EVENTS.authCompleted, { method: "email" }, user.id, "/api/auth/email/verify");
    return Response.json({ user });
  } catch (error) {
    return failure(error, request);
  }
}
