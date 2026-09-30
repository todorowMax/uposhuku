// GET /api/auth/google?next=/ — вхід через Google.
// Справжня версія, як в ukoshiku: state і next в HttpOnly-cookie на 10 хв,
// редірект у Google, повернення на /api/auth/google/callback. Зараз
// заглушка одразу відкриває сесію тестового акаунта й повертає назад.

import { NextResponse } from "next/server";
import { problem } from "@/lib/api/problem";
import { authMode } from "@/lib/auth/config";
import { createMockUser, setMockSession } from "@/lib/auth/mock-session";

/** Повертаємо лише на внутрішній шлях: інакше next став би відкритим редіректом. */
const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/");

export async function GET(request: Request) {
  if (authMode() === "off") return problem(503, "Вхід через Google ще не підключено");
  const url = new URL(request.url);
  await setMockSession(await createMockUser("google.test@example.com", "google", "Тестовий акаунт Google"));
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next")), url.origin));
}
