// POST /api/admin/payouts/:userId/verify — «перевірити в банку»: ІПН заявки є у списку отримувачів розщеплення →
// рахунок виконавця стає активним. Лише адміністратори. Нічого, крім статусу, у відповіді немає.

import { problem } from "@/lib/api/problem";
import { getAdmin } from "@/lib/server/admin";
import { verifyPayout } from "@/lib/server/payout-repo";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";
import { logServer } from "@/lib/telemetry/log";

export const POST = async (request: Request, { params }: { params: Promise<{ userId: string }> }) => {
  try {
    const admin = await getAdmin();
    if (!admin) return problem(404, "Не знайдено");
    const userId = (await params).userId;
    let outcome;
    try {
      outcome = await verifyPayout(userId);
    } catch (error) {
      if (error instanceof SecretBoxUnavailableError) return problem(503, "Ключ шифрування не задано", "Без ключа REQUISITES_KEY заявку не розшифрувати.");
      return problem(502, "Банк не відповів", "Не вдалося отримати список отримувачів. Спробуйте ще раз.");
    }
    if (outcome.kind === "missing") return problem(404, "Заявку не знайдено");
    if (outcome.kind === "not_found") return problem(409, "Банк цього ФОП не знає", "ІПН немає у списку отримувачів розщеплення. Додайте ФОП у кабінеті банку й перевірте знову.");
    logServer({ level: "info", event: "payout_activated", message: "Виплати виконавця підключено", detail: { userId, adminId: admin.id } });
    return Response.json({ status: "active" }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
