// POST /api/deals/:id {action, stageId?, simulate?, as?} — дія з угодою. Замовник:
// fund (заморозити кошти), claim_paid («я оплатив» за QR), release (прийняти
// роботу й виплатити), dispute (спір), cancel (скасувати пропозицію).

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { actAsPerformer, actOnDeal, ownerOfDeal } from "@/lib/server/deal-repo";
import { pushUser, userOfPerformer } from "@/lib/server/realtime";
import type { DealAction, PerformerAction } from "@/lib/deals/types";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";
import { notifyLater } from "@/lib/server/notify";
import { addSystemMessage } from "@/lib/server/chat-repo";
import { dealNotice } from "@/lib/telegram/notices";

const ACTIONS: DealAction[] = ["fund", "claim_paid", "release", "dispute", "cancel", "accept", "decline"];
const PERFORMER_ACTIONS: PerformerAction[] = ["accept", "decline", "confirm_paid", "deliver", "withdraw"];

/** Рядки стрічки розмови за дією з угодою. */
const PERFORMER_LINE: Record<PerformerAction, (number: string) => string> = {
  accept: (n) => `Виконавець прийняв угоду ${n}`,
  decline: (n) => `Виконавець відхилив угоду ${n}`,
  confirm_paid: (n) => `Виконавець підтвердив оплату за угодою ${n}`,
  deliver: (n) => `Виконавець здав етап за угодою ${n}`,
  withdraw: (n) => `Виконавець відкликав умови ${n}`,
};
const OWNER_LINE: Record<DealAction, (number: string) => string> = {
  fund: (n) => `Кошти за угодою ${n} заморожено`,
  claim_paid: (n) => `Замовник позначив оплату за угодою ${n}`,
  release: (n) => `Замовник прийняв роботу за угодою ${n}`,
  dispute: (n) => `Відкрито спір за угодою ${n}`,
  cancel: (n) => `Угоду ${n} скасовано`,
  accept: (n) => `Замовник прийняв умови ${n}`,
  decline: (n) => `Замовник відхилив умови ${n}`,
};

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
    if (typeof done === "string") return problem(409, "Дію не виконано", done);
    // Прийняв, підтвердив оплату чи здав роботу: кроки угоди, за якими видно, куди рухається воронка угоди.
    if (performerAction === "accept") serverEvent(EVENTS.dealAccepted, { deal_id: done.id, kind: done.method }, user.id, "/api/deals/action");
    if (performerAction === "confirm_paid") serverEvent(EVENTS.dealPaid, { deal_id: done.id, kind: done.method }, user.id, "/api/deals/action");
    if (done.status === "completed") serverEvent(EVENTS.dealCompleted, { deal_id: done.id, kind: done.method }, user.id, "/api/deals/action");
    const owner = await ownerOfDeal(done.id);
    if (owner) await addSystemMessage(owner, user.id, PERFORMER_LINE[performerAction](done.number), done.id);
    notifyLater(owner, dealNotice({ dealId: done.id, action: performerAction }));
    pushUser(owner, { t: "deal", requestId: done.requestId });
    return Response.json({ deal: done });
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
  if (typeof result === "string") return problem(409, "Дію не виконано", result);
  if (action === "fund" || action === "claim_paid") serverEvent(EVENTS.dealPaid, { deal_id: result.id, kind: result.method }, user.id, "/api/deals/action");
  if (result.status === "completed") serverEvent(EVENTS.dealCompleted, { deal_id: result.id, kind: result.method }, user.id, "/api/deals/action");
  const performerUser = userOfPerformer(result.performer.id);
  if (performerUser) await addSystemMessage(user.id, performerUser, OWNER_LINE[action](result.number), result.id);
  notifyLater(userOfPerformer(result.performer.id), dealNotice({ dealId: result.id, action: action === "accept" || action === "decline" ? `owner_${action}` : action }));
  pushUser(userOfPerformer(result.performer.id), { t: "deal", requestId: result.requestId });
  return Response.json({ deal: result });
}
