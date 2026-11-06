// GET /api/deals/:id/requisites — реквізити для оплати за угодою: знімок на момент прийняття.
// Лише сторони прийнятої угоди з прямим переказом, решта 404. Читання замовником пишеться в журнал.

import { problem } from "@/lib/api/problem";
import { paymentMethods, visibleRequisites } from "@/lib/deals/requisites";
import { getSessionUser } from "@/lib/server/auth";
import { walletConfigFor } from "@/lib/server/crypto-config";
import { readDealRequisites } from "@/lib/server/requisites-repo";
import { featureEnabledFor } from "@/lib/server/features";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("dealRequisitesRead", user.id);
    if (limited) return limited;
    const view = await readDealRequisites((await params).id, user.id);
    if (!view) return problem(404, "Угоду не знайдено");
    const crypto = await featureEnabledFor("crypto_proof", user.email);
    const wallet = (await walletConfigFor(user.email)) !== null;
    const foreign = await featureEnabledFor("foreign_links", user.email);
    const requisites = view.requisites && visibleRequisites(view.requisites, { crypto, wallet, foreign });
    return Response.json({ ...view, requisites, methods: requisites ? paymentMethods(requisites) : [], crypto, wallet, qr: await featureEnabledFor("nbu_qr", user.email) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SecretBoxUnavailableError) return problem(503, "Реквізити тимчасово недоступні", "Спробуйте пізніше.");
    return failure(error, request);
  }
};
