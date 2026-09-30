// GET /api/auth/me — хто зараз увійшов; гість — {user: null}.

import { readMockSession } from "@/lib/auth/mock-session";

export async function GET() {
  return Response.json({ user: await readMockSession() }, { headers: { "cache-control": "no-store" } });
}
