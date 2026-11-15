// POST /api/auth/logout — закрити сесію: рядок у `sessions` зникає, токен мертвий одразу.

import { closeSession } from "@/lib/server/auth";
import { route } from "@/lib/server/route";

export const POST = route({}, async () => {
  await closeSession();
  return new Response(null, { status: 204 });
});
