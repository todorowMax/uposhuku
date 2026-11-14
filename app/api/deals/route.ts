// /api/deals — угоди замовника.
// GET ?requestId= — угоди за запитом; POST — запропонувати угоду виконавцю.
// GET ?as=performer[&conversation=] — угоди виконавця. D1: угода документом (етапи всередині). Холд і фіналізація через Monobank — пізніше.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { cryptoGate, legalGate } from "@/lib/server/legal-gate";
import { phoneGate } from "@/lib/server/phone-gate";
import { rateLimited } from "@/lib/server/rate-limit";
import { escrowGate } from "@/lib/server/escrow-gate";
import { performerUserId } from "@/lib/deals/parties";
import { safeDealEnabledFor } from "@/lib/server/safe-deal";
import { performerFromResponse } from "@/lib/server/deal-parties";
import { listDeals, listDealsForPerformer, proposeDeal } from "@/lib/server/deal-repo";
import { pushUser, userOfPerformer } from "@/lib/server/realtime";
import type { DealDraft, DealMethod } from "@/lib/deals/types";
import { findRequest } from "@/lib/server/request-repo";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";
import { notifyLater } from "@/lib/server/notify";
import { addSystemMessage } from "@/lib/server/chat-repo";
import { dealNotice } from "@/lib/telegram/notices";

/** Стеля ескроу: null для інших способів; відповідь-відмова, коли немає підтвердження ризиків (перша дія з USDT) чи ескроу недоступне. */
const escrowLimit = async (input: { method: DealMethod; user: { id: string; email: string }; performerUserId: string | null }): Promise<number | null | Response> => {
  const { method, user, performerUserId: performer } = input;
  if (method !== "escrow") return null;
  const risk = await cryptoGate(user.id);
  if (risk) return risk;
  const gate = await escrowGate({ email: user.email, performerUserId: performer });
  return typeof gate === "string" ? problem(409, "Ескроу недоступне", gate) : gate.max;
};

const optionalText = (value: unknown) => (typeof value === "string" ? value : undefined);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export const GET = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const params = new URL(request.url).searchParams;
  // ?as=performer — угоди, запропоновані мені як виконавцю (за розмовою з замовником).
  if (params.get("as") === "performer") {
    return Response.json({ deals: await listDealsForPerformer(user.id, params.get("conversation") ?? undefined) }, { headers: { "cache-control": "no-store" } });
  }
  const requestId = params.get("requestId") ?? undefined;
  return Response.json({ deals: await listDeals(user.id, requestId) }, { headers: { "cache-control": "no-store" } });
};

export const POST = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const limited = await rateLimited("dealCreate", user.id);
  if (limited) return limited;
  const legal = await legalGate(user.id);
  if (legal) return legal;
  const phone = await phoneGate(user);
  if (phone) return phone;
  const body = await readJson(request);
  const requestId = text(body?.requestId, 40);
  if (!(await findRequest(user.id, requestId))) return problem(404, "Запит не знайдено");

  const rawPerformer = body?.performer as Record<string, unknown> | undefined;
  // Безпечна угода лише тим, кому її ввімкнено (SAFE_DEAL_MODE); решті метод за замовчуванням — прямий переказ.
  const safeEnabled = await safeDealEnabledFor(user.email);
  const fallback: DealMethod = safeEnabled ? "safe" : "direct";
  const method: DealMethod = body?.method === "safe" || body?.method === "direct" || body?.method === "escrow" ? body.method : fallback;
  if (method === "safe" && !safeEnabled) return problem(409, "Безпечна угода ще недоступна");
  const rawStages = Array.isArray(body?.stages) ? body.stages.slice(0, 6) : [];
  const responseId = text(body?.responseId, 80);
  if (!text(rawPerformer?.id, 60) || !responseId) return problem(400, "Угоду не створено", "Не вказано виконавця.");
  // Виконавця, його ім'я й фото бере сервер з відгуку й профілю: клієнту вірити не можна.
  const performer = await performerFromResponse(user.id, { requestId, responseId, claimedPerformerId: text(rawPerformer?.id, 60) });
  if (typeof performer === "string") return problem(400, "Угоду не створено", performer);

  const draft: DealDraft = {
    requestId,
    responseId,
    method,
    performer,
    criteria: optionalText(body?.criteria),
    stages: rawStages.map((stage: Record<string, unknown>) => ({
      title: text(stage?.title, 60),
      amount: typeof stage?.amount === "number" ? Math.round(stage.amount) : NaN,
      days: typeof stage?.days === "number" ? Math.round(stage.days) : NaN,
    })),
  };
  // Ескроу: прапорець у того, хто створює, фабрика, підтверджений гаманець виконавця й стеля з контракту.
  const escrowMax = await escrowLimit({ method, user, performerUserId: performerUserId(performer.id) });
  if (escrowMax instanceof Response) return escrowMax;
  const result = await proposeDeal(user.id, draft, { safeEnabled, escrowMax });
  if (typeof result === "string") return problem(400, "Угоду не створено", result);
  notifyLater(userOfPerformer(result.performer.id), dealNotice({ dealId: result.id, action: "proposed" }));
  serverEvent(EVENTS.dealCreated, { deal_id: result.id, kind: result.method, stages: result.stages.length }, user.id, "/api/deals");
  pushUser(userOfPerformer(result.performer.id), { t: "deal", requestId: result.requestId });
  const performerUser = userOfPerformer(result.performer.id);
  if (performerUser) await addSystemMessage(user.id, performerUser, `Угоду ${result.number} запропоновано`, result.id);
  return Response.json({ deal: result }, { status: 201 });
};
