// GET /api/deals/config — що доступно саме цій людині: чи може вона користуватися безпечною угодою.
// Рішення приймає сервер (режим і список пошт), клієнт лише показує або ховає вибір.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { safeDealEnabledFor } from "@/lib/server/safe-deal";

export const GET = async () => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ safeDeal: await safeDealEnabledFor(user.email) }, { headers: { "cache-control": "no-store" } });
};
