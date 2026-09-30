// POST /api/auth/logout — закрити сесію.

import { clearMockSession } from "@/lib/auth/mock-session";

export async function POST() {
  await clearMockSession();
  return new Response(null, { status: 204 });
}
