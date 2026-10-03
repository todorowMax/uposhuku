// /api/deals — угоди замовника.
// GET ?requestId= — угоди за запитом; POST — запропонувати угоду виконавцю.
// Справжня версія: D1 (deals, deal_stages), холд і фіналізація через Monobank,
// події в Durable Object чату.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { isFop } from "@/lib/deals/fop";
import { listDeals, proposeDeal } from "@/lib/deals/mock-store";
import type { DealDraft, DealMethod } from "@/lib/deals/types";
import { findRequest } from "@/lib/requests/mock-store";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const requestId = new URL(request.url).searchParams.get("requestId") ?? undefined;
  return Response.json({ deals: listDeals(user.id, requestId) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  const requestId = text(body?.requestId, 40);
  if (!findRequest(user.id, requestId)) return problem(404, "Запит не знайдено");

  const rawPerformer = body?.performer as Record<string, unknown> | undefined;
  const performerId = text(rawPerformer?.id, 60);
  const method: DealMethod = body?.method === "direct" ? "direct" : "safe";
  const photo = typeof rawPerformer?.photo === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(rawPerformer.photo) && rawPerformer.photo.length < 300_000 ? rawPerformer.photo : undefined;
  const rawStages = Array.isArray(body?.stages) ? body.stages.slice(0, 6) : [];

  const draft: DealDraft = {
    requestId,
    responseId: text(body?.responseId, 80),
    method,
    performer: {
      id: performerId,
      name: text(rawPerformer?.name, 80),
      photo,
      avatarIndex: typeof rawPerformer?.avatarIndex === "number" ? Math.max(0, Math.min(255, Math.round(rawPerformer.avatarIndex))) : 0,
      specialty: text(rawPerformer?.specialty, 80),
      // ФОП визначаємо самі: цьому полю з клієнта не вірити.
      fop: isFop(performerId),
    },
    stages: rawStages.map((stage: Record<string, unknown>) => ({
      title: text(stage?.title, 60),
      amount: typeof stage?.amount === "number" ? Math.round(stage.amount) : NaN,
      days: typeof stage?.days === "number" ? Math.round(stage.days) : NaN,
    })),
  };
  if (!draft.performer.id || !draft.responseId) return problem(400, "Угоду не створено", "Не вказано виконавця.");
  const result = proposeDeal(user.id, draft);
  return typeof result === "string" ? problem(400, "Угоду не створено", result) : Response.json({ deal: result }, { status: 201 });
}
