// GET /api/deals/:id/requisites — реквізити для оплати за угодою: знімок на момент прийняття.
// Лише сторони прийнятої угоди з прямим переказом, решта 404. Читання замовником пишеться в журнал.

import { problem } from "@/lib/api/problem";
import { qrVisible } from "@/lib/deals/nbu-qr";
import { getSessionUser } from "@/lib/server/auth";
import { readDealRequisites } from "@/lib/server/requisites-repo";
import { isProduction } from "@/lib/server/env";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const view = await readDealRequisites((await params).id, user.id);
    if (!view) return problem(404, "Угоду не знайдено");
    return Response.json({ ...view, qr: qrVisible(isProduction()) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SecretBoxUnavailableError) return problem(503, "Реквізити тимчасово недоступні", "Спробуйте пізніше.");
    return failure(error, request);
  }
};
