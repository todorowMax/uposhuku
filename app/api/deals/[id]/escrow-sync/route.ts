// POST /api/deals/:id/escrow-sync { stageId?, client? } — звірка етапу ескроу зі станом контракту після транзакції
// клієнта (внесення, здача, приймання, спір, завершення за таймером). Лише сторони угоди. Статус етапу міняє тільки
// стан контракту; `client` (гаманець замовника, лише від замовника) потрібен до першої звірки етапу, адресу клона сервер рахує сам.
// Мережа недоступна: 503, стан не міняємо.

import { problem, readJson } from "@/lib/api/problem";
import { currentStage } from "@/lib/deals/machine";
import { getSessionUser } from "@/lib/server/auth";
import { dealForParty } from "@/lib/server/deal-access";
import { ownerOfDeal } from "@/lib/server/deal-repo";
import { syncEscrowStage } from "@/lib/server/escrow-sync";
import { cryptoGate } from "@/lib/server/legal-gate";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("escrowSync", user.id);
    if (limited) return limited;
    const dealId = (await params).id;
    const deal = await dealForParty(dealId, user.id);
    if (!deal || deal.method !== "escrow") return problem(404, "Угоду не знайдено");
    const body = await readJson(request);
    const stageId = typeof body?.stageId === "string" ? body.stageId : currentStage(deal)?.id;
    if (!stageId || !deal.stages.some((item) => item.id === stageId)) return problem(400, "Етапу не знайдено");
    // Гаманець замовника приймаємо лише від замовника: виконавець не підставить власний другий гаманець.
    const fromCustomer = (await ownerOfDeal(dealId)) === user.id;
    const client = fromCustomer && typeof body?.client === "string" ? body.client : undefined;
    // Прив'язка гаманця замовника до етапу це перша звірка після внесення USDT: ризик має бути прийнято.
    if (client) {
      const refused = await cryptoGate(user.id);
      if (refused) return refused;
    }
    const result = await syncEscrowStage({ dealId, stageId, client });
    if (!result.ok) return problem(result.status, result.title, result.detail);
    return Response.json({ deal: result.deal, changed: result.changed, funded: result.funded }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SecretBoxUnavailableError) return problem(503, "Реквізити тимчасово недоступні", "Спробуйте пізніше.");
    return failure(error, request);
  }
};
