// /api/deals/:id/pay — оплата етапу безпечної угоди через Monobank.
// POST {card?} — замовник отримує pageUrl сторінки банку (холд). Активний неоплачений рахунок використовується повторно.
// GET — стан платежу поточного етапу: перепитує банк, доки рахунок не завершено, і віддає угоду. Для повернення з банку на сайт.
// Статус «заморожено» ставить лише підтвердження банку, ніколи ця відповідь.

import { problem, readJson } from "@/lib/api/problem";
import { currentStage } from "@/lib/deals/machine";
import { getSessionUser } from "@/lib/server/auth";
import { reconcilePayment } from "@/lib/server/deal-money";
import { startStagePayment } from "@/lib/server/deal-pay";
import { getDealForOwner } from "@/lib/server/deal-repo";
import { activeStagePayment } from "@/lib/server/payment-repo";
import { failure } from "@/lib/server/route";

const NO_STORE = { "cache-control": "no-store" };

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const body = await readJson(request);
    // Тип картки не обирає людина (ітерація 4 прибере вибір); поки рахуємо за вищою ставкою, щоб виконавець не лишився внакладі.
    const card = body?.card === "ua" ? "ua" : "foreign";
    const result = await startStagePayment({ user, dealId: (await params).id, card, origin: new URL(request.url).origin });
    if (!result.ok) return problem(result.status, result.title, result.detail);
    return Response.json({ pageUrl: result.pageUrl, reused: result.reused }, { status: result.reused ? 200 : 201, headers: NO_STORE });
  } catch (error) {
    return failure(error, request);
  }
};

export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const dealId = (await params).id;
    const deal = await getDealForOwner(dealId, user.id);
    if (!deal) return problem(404, "Угоду не знайдено");
    const stage = currentStage(deal);
    const payment = stage ? await activeStagePayment(deal.id, stage.id) : null;
    if (!payment || payment.invoiceId.startsWith("pending:")) return Response.json({ status: null, deal }, { headers: NO_STORE });
    try {
      const state = await reconcilePayment(payment);
      return Response.json({ status: state.bank.status, deal: state.deal ?? deal }, { headers: NO_STORE });
    } catch {
      // Банк не відповів: віддаємо збережене, клієнт спитає ще раз.
      return Response.json({ status: payment.status, deal }, { headers: NO_STORE });
    }
  } catch (error) {
    return failure(error, request);
  }
};
