// GET /api/auth/google?next=/&accepted=1 — вхід через Google. `accepted=1`: людина поставила галочку «Мені є 18 років і приймаю умови»;
// без неї новому користувачеві вхід не відкриваємо (400), згода йде в cookie стану й записується в колбеку.
// Є GOOGLE_CLIENT_ID і секрет: state і next у HttpOnly-cookie на 10 хв, редірект
// у Google, повернення на /api/auth/google/callback. Без них локально заглушка
// відкриває сесію тестового акаунта, на проді вхід вимкнений.

import { NextResponse } from "next/server";
import { problem } from "@/lib/api/problem";
import { REQUIRED_DOCS } from "@/lib/legal/acceptance";
import { loginWithGoogle } from "@/lib/server/auth";
import { termsRequired } from "@/lib/server/legal-gate";
import { needsTermsAcceptance, recordAcceptance } from "@/lib/server/legal-repo";
import { isProduction, readVar } from "@/lib/server/env";
import { googleConfigured, safeNext } from "@/lib/server/google";
import { clientIp, failure } from "@/lib/server/route";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const accepted = url.searchParams.get("accepted") === "1";
  try {
    if (!googleConfigured()) {
      if (isProduction()) return problem(503, "Вхід через Google ще не підключено");
      const dev = { googleId: "dev-google-test", email: "google.test@example.com" };
      const needsTerms = await needsTermsAcceptance(dev);
      if (needsTerms && !accepted) return termsRequired();
      const user = await loginWithGoogle({ ...dev, name: "Тестовий акаунт Google", picture: null });
      if (needsTerms) await recordAcceptance({ userId: user.id, docs: REQUIRED_DOCS, source: "signup", ip: clientIp(request) });
      return NextResponse.redirect(new URL(next, url.origin));
    }
    const state = crypto.randomUUID();
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search = new URLSearchParams({
      client_id: readVar("GOOGLE_CLIENT_ID") as string,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    }).toString();
    const response = NextResponse.redirect(target);
    response.cookies.set("vm_google_state", JSON.stringify({ state, next, accepted }), { httpOnly: true, sameSite: "lax", secure: isProduction(), path: "/api/auth/google", maxAge: 600 });
    return response;
  } catch (error) {
    return failure(error, request);
  }
}
