// GET /api/auth/google/callback — Google повертає сюди з кодом.
// Перевіряємо state з cookie, міняємо код на токен і читаємо профіль.

import { NextResponse } from "next/server";
import { problem } from "@/lib/api/problem";
import { REQUIRED_DOCS } from "@/lib/legal/acceptance";
import { loginWithGoogle } from "@/lib/server/auth";
import { termsRequired } from "@/lib/server/legal-gate";
import { needsTermsAcceptance, recordAcceptance } from "@/lib/server/legal-repo";
import { readVar } from "@/lib/server/env";
import { clientIp, failure } from "@/lib/server/route";
import { googleConfigured, safeNext } from "@/lib/server/google";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!googleConfigured()) return problem(503, "Вхід через Google ще не підключено");
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)vm_google_state=([^;]+)/)?.[1];
  let saved: { state?: string; next?: string; accepted?: boolean } = {};
  try {
    saved = raw ? (JSON.parse(decodeURIComponent(raw)) as typeof saved) : {};
  } catch {
    saved = {};
  }
  const code = url.searchParams.get("code");
  if (!code || !saved.state || saved.state !== url.searchParams.get("state")) {
    return problem(400, "Вхід через Google не вдався", "Спробуйте увійти ще раз.");
  }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: readVar("GOOGLE_CLIENT_ID") as string,
        client_secret: readVar("GOOGLE_CLIENT_SECRET") as string,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return problem(400, "Вхід через Google не вдався", "Спробуйте увійти ще раз.");
    const { access_token } = (await tokenResponse.json()) as { access_token?: string };
    const infoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${access_token}` } });
    const info = (await infoResponse.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
    if (!infoResponse.ok || !info.sub || !info.email || !info.email_verified) {
      return problem(400, "Вхід через Google не вдався", "Google не підтвердив вашу пошту.");
    }
    const who = { googleId: info.sub, email: info.email.trim().toLowerCase() };
    const needsTerms = await needsTermsAcceptance(who);
    if (needsTerms && saved.accepted !== true) return termsRequired();
    const user = await loginWithGoogle({ ...who, name: info.name ?? null, picture: info.picture ?? null });
    if (needsTerms) await recordAcceptance({ userId: user.id, docs: REQUIRED_DOCS, source: "signup", ip: clientIp(request) });
    serverEvent(EVENTS.authCompleted, { method: "google" }, user.id, "/api/auth/google/callback");
    const response = NextResponse.redirect(new URL(safeNext(saved.next), url.origin));
    response.cookies.delete({ name: "vm_google_state", path: "/api/auth/google" });
    return response;
  } catch (error) {
    return failure(error, request);
  }
}
