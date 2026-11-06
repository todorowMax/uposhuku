// GET /api/deals/config — що доступно саме цій людині: чи може вона користуватися безпечною угодою.
// `methods`: що приймає виконавець для прямого переказу (лише назви).
// Рішення приймає сервер (режим і список пошт), клієнт лише показує або ховає вибір.
// З `?performer=me-<id>` додаємо, чи підключив цей виконавець виплати: без цього безпечну угоду з ним не оформити.

import { problem } from "@/lib/api/problem";
import { performerUserId } from "@/lib/deals/parties";
import { getSessionUser } from "@/lib/server/auth";
import { hasActivePayout } from "@/lib/server/deal-parties";
import { walletConfigFor } from "@/lib/server/crypto-config";
import { featureEnabledFor } from "@/lib/server/features";
import { performerMethods } from "@/lib/server/requisites-repo";
import { safeDealEnabledFor } from "@/lib/server/safe-deal";

const methodsFor = async (performer: string, email: string) =>
  performerMethods(performer, {
    crypto: await featureEnabledFor("crypto_proof", email),
    wallet: (await walletConfigFor(email)) !== null,
    foreign: await featureEnabledFor("foreign_links", email),
  });

export const GET = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const performerId = new URL(request.url).searchParams.get("performer");
  const performer = performerId ? performerUserId(performerId) : null;
  const safeDeal = await safeDealEnabledFor(user.email);
  // Про виплати кажемо лише тоді, коли безпечна угода людині взагалі доступна.
  const performerPayouts = safeDeal && performer ? await hasActivePayout(performer) : undefined;
  // Способи прямого переказу, які приймає виконавець: лише назви, без значень. Збій читання не ламає форму умов.
  const methods = performer ? await methodsFor(performer, user.email).catch(() => undefined) : undefined;
  return Response.json({ safeDeal, performerPayouts, methods }, { headers: { "cache-control": "no-store" } });
};
