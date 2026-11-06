// POST /api/deals/:id/complaint {stageId, reason, text} — скарга сторони на пряму угоду. Гроші й статус етапу
// не змінюються: прямий переказ ми повернути не можемо. Скарга йде модератору; друга сторона бачить у розмові
// лише службовий рядок без автора, причини й тексту. Чужа угода дає 404.

import { problem, readJson } from "@/lib/api/problem";
import { complaintNotice } from "@/lib/deals/complaints";
import { getSessionUser } from "@/lib/server/auth";
import { addSystemMessage } from "@/lib/server/chat-repo";
import { fileComplaint } from "@/lib/server/complaint-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { pushUser, userOfPerformer } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getSessionUser();
    if (!user) return problem(401, "Потрібен вхід");
    const limited = await rateLimited("dealComplaint", user.id);
    if (limited) return limited;
    const body = await readJson(request);
    const filed = await fileComplaint({ userId: user.id, dealId: (await params).id, stageId: body?.stageId, reason: body?.reason, text: body?.text });
    if (filed === null) return problem(404, "Не знайдено");
    if (typeof filed === "string") return problem(409, "Скаргу не подано", filed);
    const { deal, ownerUserId } = filed;
    const performerUser = userOfPerformer(deal.performer.id);
    if (performerUser) await addSystemMessage(ownerUserId, performerUser, complaintNotice(deal.number), deal.id);
    pushUser(ownerUserId, { t: "deal", requestId: deal.requestId });
    pushUser(performerUser, { t: "deal", requestId: deal.requestId });
    return Response.json({ complaint: { id: filed.complaint.id, status: "open" } }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
