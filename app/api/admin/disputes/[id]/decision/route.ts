// POST /api/admin/disputes/:dealId/decision {action, comment, stageId?} — рішення модератора:
// release (виплатити виконавцю), refund (повернути замовнику), rework (на доопрацювання).
// Гроші не рухаються (оплата ще не підключена): змінюється стан угоди, у журнал пишеться
// хто й чому, обидві сторони отримують рядок у розмові й сповіщення.

import { problem, readJson } from "@/lib/api/problem";
import { checkComment, decisionLine, MODERATOR_ACTIONS } from "@/lib/admin/decisions";
import type { ModeratorAction } from "@/lib/deals/types";
import { getAdmin } from "@/lib/server/admin";
import { addSystemMessage } from "@/lib/server/chat-repo";
import { actAsModerator } from "@/lib/server/deal-repo";
import { notifyLater } from "@/lib/server/notify";
import { pushUser } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";
import { dealNotice } from "@/lib/telegram/notices";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdmin();
    if (!admin) return problem(404, "Не знайдено");
    const body = await readJson(request);
    const action = MODERATOR_ACTIONS.find((item): item is ModeratorAction => item === body?.action);
    if (!action) return problem(400, "Невідоме рішення");
    const checked = checkComment(body?.comment);
    if ("error" in checked) return problem(400, "Потрібен коментар", checked.error);
    const result = await actAsModerator((await params).id, action, typeof body?.stageId === "string" ? body.stageId : undefined, { userId: admin.id, email: admin.email, comment: checked.comment });
    if (result === null) return problem(404, "Не знайдено");
    if (typeof result === "string") return problem(409, "Рішення не застосовано", result);

    const { deal, stage, ownerUserId, decisionId } = result;
    const performerUserId = deal.performer.id.startsWith("me-") ? deal.performer.id.slice(3) : null;
    // Рядок у стрічці пари (бачать обидва) і сповіщення кожному зі своїм ключем, щоб не злилися.
    if (performerUserId) await addSystemMessage(ownerUserId, performerUserId, decisionLine(deal, stage, action, checked.comment), deal.id);
    const notice = dealNotice({ dealId: deal.id, action: `moderator_${action}`, conversationId: deal.conversationId });
    for (const userId of [ownerUserId, performerUserId]) {
      if (userId && notice) notifyLater(userId, { ...notice, key: `${notice.key}:${decisionId}:${userId}` });
      pushUser(userId, { t: "deal", requestId: deal.requestId });
    }
    return Response.json({ deal }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
}
