// GET /api/auth/me — хто зараз увійшов; гість — {user: null}.

import { getSessionUser } from "@/lib/server/auth";

export async function GET() {
  return Response.json({ user: await getSessionUser() }, { headers: { "cache-control": "no-store" } });
}
