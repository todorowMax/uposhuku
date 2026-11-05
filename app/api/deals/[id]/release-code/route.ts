// POST /api/deals/:id/release-code — код на пошту замовника для приймання етапу від 10 000 ₴.
// Лише замовник, лише безпечна угода, лише етап, який здано й ще не прийнято. Код діє 10 хвилин.

import { problem } from "@/lib/api/problem";
import { currentStage } from "@/lib/deals/machine";
import { releaseNeedsCode } from "@/lib/deals/limits";
import { getSessionUser } from "@/lib/server/auth";
import { getDealForOwner } from "@/lib/server/deal-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { sendReleaseCode } from "@/lib/server/release-code";
import { failure } from "@/lib/server/route";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("releaseCode", user.id);
    if (limited) return limited;
    const deal = await getDealForOwner((await params).id, user.id);
    if (!deal) return problem(404, "Угоду не знайдено");
    const stage = currentStage(deal);
    if (deal.method !== "safe" || stage?.status !== "delivered" || !releaseNeedsCode(stage.amount)) return problem(409, "Код не потрібен", "Для цього етапу код підтвердження не потрібен.");
    const outcome = await sendReleaseCode({ target: { userId: user.id, dealId: deal.id, stageId: stage.id }, email: user.email, dealNumber: deal.number });
    return Response.json({ sent: outcome === "sent" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
