// POST /api/auth/logout — закрити сесію: рядок у `sessions` зникає, токен мертвий одразу.

import { closeSession } from "@/lib/server/auth";

export async function POST() {
  await closeSession();
  return new Response(null, { status: 204 });
}
