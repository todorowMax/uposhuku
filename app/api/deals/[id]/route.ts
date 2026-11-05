// POST /api/deals/:id {action, stageId?, as?} — дія з угодою. Замовник:
// claim_paid («я оплатив» після прямого переказу), release (прийняти роботу й виплатити),
// dispute (спір), cancel (скасувати пропозицію). Оплата безпечної угоди йде окремо: POST /api/deals/:id/pay.
// У безпечній угоді release лише записує намір, а «виплачено» ставить банк (lib/server/deal-money.ts).

import { problem, readJson } from "@/lib/api/problem";
import { releaseNeedsCode } from "@/lib/deals/limits";
import { currentStage } from "@/lib/deals/machine";
import { getSessionUser } from "@/lib/server/auth";
import { rateLimited } from "@/lib/server/rate-limit";
import { verifyReleaseCode } from "@/lib/server/release-code";
import { settleMessage, settleStage } from "@/lib/server/deal-money";
import { actAsPerformer, actOnDeal, getDealForOwner, ownerOfDeal } from "@/lib/server/deal-repo";
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

/**
 * Приймання етапу від 10 000 ₴ у безпечній угоді потребує коду з пошти замовника. Повертає відповідь-відмову або null.
 * Код перевіряємо лише коли етап справді можна прийняти, щоб помилковий запит не спалював чинний код.
 */
const releaseCodeGate = async (input: { userId: string; dealId: string; stageId?: string; code: unknown }): Promise<Response | null> => {
  const deal = await getDealForOwner(input.dealId, input.userId);
  const stage = deal?.stages.find((item) => item.id === (input.stageId ?? currentStage(deal)?.id));
  if (!deal || deal.method !== "safe" || stage?.status !== "delivered" || !releaseNeedsCode(stage.amount)) return null;
  if (input.code === undefined || input.code === "") return problem(403, "Потрібен код з пошти", "Для виплати від 10 000 ₴ введіть код, який ми надіслали на вашу пошту.", "/problems/release-code-required");
  const outcome = await verifyReleaseCode({ userId: input.userId, dealId: deal.id, stageId: stage.id }, input.code);
  if (outcome === "ok") return null;
  return problem(403, "Невірний код", outcome === "wrong" ? "Невірний код. Перевірте лист і спробуйте ще раз." : "Код недійсний або застарів. Запросіть новий.", "/problems/release-code-invalid");
};

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const limited = await rateLimited("dealAction", user.id);
  if (limited) return limited;
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
  const stageId = typeof body?.stageId === "string" ? body.stageId : undefined;
  const dealId = (await params).id;
  if (action === "release") {
    const refused = await releaseCodeGate({ userId: user.id, dealId, stageId, code: body?.code });
    if (refused) return refused;
  }
  const accepted = await actOnDeal(user.id, dealId, action, stageId);
  if (accepted === null) return problem(404, "Угоду не знайдено");
  if (typeof accepted === "string") return problem(409, "Дію не виконано", accepted);
  // Приймання безпечної угоди: намір вже записано (releasing), тепер просимо банк. Підсумок «виплачено» поставить сам банк.
  let result = accepted;
  const paying = action === "release" && accepted.method === "safe" ? accepted.stages.find((item) => item.status === "releasing") : undefined;
  if (paying) {
    const outcome = await settleStage(dealId, paying.id);
    result = (await getDealForOwner(dealId, user.id)) ?? accepted;
    const message = settleMessage(outcome);
    if (message?.status === 409) return problem(409, "Банк не виконав виплату", message.detail);
  }
  if (action === "claim_paid") serverEvent(EVENTS.dealPaid, { deal_id: result.id, kind: result.method }, user.id, "/api/deals/action");
  if (result.status === "completed") serverEvent(EVENTS.dealCompleted, { deal_id: result.id, kind: result.method }, user.id, "/api/deals/action");
  const performerUser = userOfPerformer(result.performer.id);
  if (performerUser) await addSystemMessage(user.id, performerUser, OWNER_LINE[action](result.number), result.id);
  notifyLater(userOfPerformer(result.performer.id), dealNotice({ dealId: result.id, action: action === "accept" || action === "decline" ? `owner_${action}` : action }));
  pushUser(userOfPerformer(result.performer.id), { t: "deal", requestId: result.requestId });
  return Response.json({ deal: result });
};
