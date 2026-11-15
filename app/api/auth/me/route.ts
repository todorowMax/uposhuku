// GET /api/auth/me — хто зараз увійшов; гість — {user: null}.

import { getSessionUser } from "@/lib/server/auth";
import { route } from "@/lib/server/route";

export const GET = route({}, async () => {
  return Response.json({ user: await getSessionUser() }, { headers: { "cache-control": "no-store" } });
});
