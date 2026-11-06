// POST /api/deals/:id/receipt {stageId, attachmentId} — чек до етапу прямого переказу. Файл замовник спершу
// завантажує в розмову угоди (POST /api/conversations/:id/attachments), тут лише прив'язує його до етапу.
// Лише замовник; чужа угода чи чужий файл дають 404.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { attachReceipt } from "@/lib/server/deal-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { pushUser, userOfPerformer } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const user = await getSessionUser();
    if (!user) return problem(401, "Потрібен вхід");
    const limited = await rateLimited("dealReceipt", user.id);
    if (limited) return limited;
    const body = await readJson(request);
    const result = await attachReceipt({ userId: user.id, dealId: (await params).id, stageId: body?.stageId, attachmentId: body?.attachmentId });
    if (result === null) return problem(404, "Не знайдено");
    if (typeof result === "string") return problem(409, "Чек не додано", result);
    pushUser(userOfPerformer(result.performer.id), { t: "deal", requestId: result.requestId });
    return Response.json({ deal: result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
