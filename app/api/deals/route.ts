// /api/deals — угоди замовника.
// GET ?requestId= — угоди за запитом; POST — запропонувати угоду виконавцю.
// GET ?as=performer[&conversation=] — угоди виконавця. D1: угода документом (етапи всередині). Холд і фіналізація через Monobank — пізніше.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { SAFE_DEAL_ENABLED } from "@/lib/deals/flags";
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

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const params = new URL(request.url).searchParams;
  // ?as=performer — угоди, запропоновані мені як виконавцю (за розмовою з замовником).
  if (params.get("as") === "performer") {
    return Response.json({ deals: await listDealsForPerformer(user.id, params.get("conversation") ?? undefined) }, { headers: { "cache-control": "no-store" } });
  }
  const requestId = params.get("requestId") ?? undefined;
  return Response.json({ deals: await listDeals(user.id, requestId) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  const requestId = text(body?.requestId, 40);
  if (!(await findRequest(user.id, requestId))) return problem(404, "Запит не знайдено");

  const rawPerformer = body?.performer as Record<string, unknown> | undefined;
  // Поки безпечна угода вимкнена, метод за замовчуванням — прямий переказ, а safe відхиляємо.
  const fallback: DealMethod = SAFE_DEAL_ENABLED ? "safe" : "direct";
  const method: DealMethod = body?.method === "safe" || body?.method === "direct" ? body.method : fallback;
  if (method === "safe" && !SAFE_DEAL_ENABLED) return problem(409, "Безпечна угода ще недоступна");
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
    stages: rawStages.map((stage: Record<string, unknown>) => ({
      title: text(stage?.title, 60),
      amount: typeof stage?.amount === "number" ? Math.round(stage.amount) : NaN,
      days: typeof stage?.days === "number" ? Math.round(stage.days) : NaN,
    })),
  };
  const result = await proposeDeal(user.id, draft);
  if (typeof result === "string") return problem(400, "Угоду не створено", result);
  notifyLater(userOfPerformer(result.performer.id), dealNotice({ dealId: result.id, action: "proposed" }));
  serverEvent(EVENTS.dealCreated, { deal_id: result.id, kind: result.method, stages: result.stages.length }, user.id, "/api/deals");
  pushUser(userOfPerformer(result.performer.id), { t: "deal", requestId: result.requestId });
  const performerUser = userOfPerformer(result.performer.id);
  if (performerUser) await addSystemMessage(user.id, performerUser, `Угоду ${result.number} запропоновано`, result.id);
  return Response.json({ deal: result }, { status: 201 });
}
