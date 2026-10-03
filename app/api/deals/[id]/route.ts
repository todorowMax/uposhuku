// POST /api/deals/:id {action, stageId?, simulate?, as?} — дія з угодою. Замовник:
// fund (заморозити кошти), claim_paid («я оплатив» за QR), release (прийняти
// роботу й виплатити), dispute (спір), cancel (скасувати пропозицію).

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { actAsPerformer, actOnDeal } from "@/lib/server/deal-repo";
import type { DealAction, PerformerAction } from "@/lib/deals/types";

const ACTIONS: DealAction[] = ["fund", "claim_paid", "release", "dispute", "cancel"];
const PERFORMER_ACTIONS: PerformerAction[] = ["accept", "decline", "confirm_paid", "deliver"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  // as: "performer" — дія виконавця (прийняти, підтвердити оплату, здати етап).
  if (body?.as === "performer") {
    const performerAction = PERFORMER_ACTIONS.find((item) => item === body?.action);
    if (!performerAction) return problem(400, "Невідома дія");
    const done = await actAsPerformer(user.id, (await params).id, performerAction, typeof body?.stageId === "string" ? body.stageId : undefined);
    if (done === null) return problem(404, "Угоду не знайдено");
    return typeof done === "string" ? problem(409, "Дію не виконано", done) : Response.json({ deal: done });
  }
  const action = ACTIONS.find((item) => item === body?.action);
  if (!action) return problem(400, "Невідома дія");
  // Тестова відмова банку при замороженні, щоб побачити, як це виглядає.
  if (action === "fund" && body?.simulate === "declined") {
    return problem(402, "Кошти не заморожено", "Банк відхилив операцію. Гроші не списано, спробуйте іншу картку.", "/problems/payment-declined");
  }
  const stageId = typeof body?.stageId === "string" ? body.stageId : undefined;
  const result = await actOnDeal(user.id, (await params).id, action, stageId);
  if (result === null) return problem(404, "Угоду не знайдено");
  return typeof result === "string" ? problem(409, "Дію не виконано", result) : Response.json({ deal: result });
}
