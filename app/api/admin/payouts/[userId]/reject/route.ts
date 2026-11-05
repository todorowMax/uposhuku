// POST /api/admin/payouts/:userId/reject { reason } — відхилити заявку виконавця або відключити активний рахунок.
// Статус `rejected`, причина видна виконавцю, який може подати заявку знову. Лише адміністратори; запис у журнал.

import { problem, readJson } from "@/lib/api/problem";
import { checkRejectReason } from "@/lib/deals/payout";
import { getAdmin } from "@/lib/server/admin";
import { rejectPayout } from "@/lib/server/payout-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { logServer } from "@/lib/telemetry/log";

export const POST = async (request: Request, { params }: { params: Promise<{ userId: string }> }) => {
  try {
    const admin = await getAdmin();
    if (!admin) return problem(404, "Не знайдено");
    const limited = await rateLimited("adminDecision", admin.id);
    if (limited) return limited;
    const checked = checkRejectReason((await readJson(request))?.reason);
    if (!checked.ok) return problem(400, "Потрібна причина", checked.error);
    const userId = (await params).userId;
    const outcome = await rejectPayout(userId, checked.reason);
    if (outcome.kind === "missing") return problem(404, "Заявку не знайдено");
    logServer({
      level: "info",
      event: outcome.was === "active" ? "payout_disabled" : "payout_rejected",
      message: outcome.was === "active" ? "Виплати виконавця відключено" : "Заявку на виплати відхилено",
      detail: { userId, adminId: admin.id, adminEmail: admin.email, was: outcome.was, reason: checked.reason },
    });
    return Response.json({ status: "rejected" }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
