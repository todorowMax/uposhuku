// GET /api/deals/config — що доступно саме цій людині: чи може вона користуватися безпечною угодою.
// Рішення приймає сервер (режим і список пошт), клієнт лише показує або ховає вибір.
// З `?performer=me-<id>` додаємо, чи підключив цей виконавець виплати: без цього безпечну угоду з ним не оформити.

import { problem } from "@/lib/api/problem";
import { performerUserId } from "@/lib/deals/parties";
import { getSessionUser } from "@/lib/server/auth";
import { hasActivePayout } from "@/lib/server/deal-parties";
import { safeDealEnabledFor } from "@/lib/server/safe-deal";

export const GET = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const performerId = new URL(request.url).searchParams.get("performer");
  const performer = performerId ? performerUserId(performerId) : null;
  const safeDeal = await safeDealEnabledFor(user.email);
  // Про виплати кажемо лише тоді, коли безпечна угода людині взагалі доступна.
  const performerPayouts = safeDeal && performer ? await hasActivePayout(performer) : undefined;
  return Response.json({ safeDeal, performerPayouts }, { headers: { "cache-control": "no-store" } });
};
