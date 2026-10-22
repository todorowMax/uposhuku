// POST /api/conversations/:id/deals — виставити умови прямо в розмові (без запиту).
// Будь-яка сторона; друга приймає чи відхиляє. Тіло: {title, description?, method, stages[]}.

import { problem, readJson } from "@/lib/api/problem";
import { isFop } from "@/lib/deals/fop";
import type { DealMethod } from "@/lib/deals/types";
import { getSessionUser } from "@/lib/server/auth";
import { accessibleConversation, addSystemMessage } from "@/lib/server/chat-repo";
import { proposeDirectDeal } from "@/lib/server/deal-repo";
import { notifyLater } from "@/lib/server/notify";
import { getProfile } from "@/lib/server/profile-repo";
import { pushUser } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";
import { dealNotice } from "@/lib/telegram/notices";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const access = await accessibleConversation((await params).id, user.id);
    if (!access) return problem(404, "Розмову не знайдено");
    const { conversation, role } = access;
    if (!conversation.performerUserId) return problem(400, "Умови не виставлено", "З демо-виконавцем угоду оформити не можна.");
    const body = await readJson(request);
    const method: DealMethod = body?.method === "safe" ? "safe" : "direct";
    const rawStages = Array.isArray(body?.stages) ? body.stages.slice(0, 6) : [];
    const profile = await getProfile(conversation.performerUserId);
    const performerId = conversation.performerId;
    const result = await proposeDirectDeal(
      conversation,
      role,
      {
        title: text(body?.title, 80),
        description: text(body?.description, 1000),
        method,
        performer: {
          id: performerId,
          name: profile?.name ?? "Виконавець",
          photo: undefined,
          avatarIndex: 0,
          specialty: profile?.specialty ?? "",
          // ФОП визначаємо самі: цьому полю з клієнта не вірити.
          fop: isFop(performerId),
        },
        stages: rawStages.map((stage: Record<string, unknown>) => ({
          title: text(stage?.title, 60),
          amount: typeof stage?.amount === "number" ? Math.round(stage.amount) : NaN,
          days: typeof stage?.days === "number" ? Math.round(stage.days) : NaN,
        })),
      },
    );
    if (typeof result === "string") return problem(400, "Умови не виставлено", result);
    serverEvent(EVENTS.dealCreated, { deal_id: result.id, kind: result.method, stages: result.stages.length, direct: true }, user.id, "/api/conversations/deals");
    const other = role === "customer" ? conversation.performerUserId : conversation.customerUserId;
    notifyLater(other, dealNotice({ dealId: result.id, action: "proposed", conversationId: conversation.id }));
    pushUser(other, { t: "deal", requestId: result.requestId });
    pushUser(user.id, { t: "deal", requestId: result.requestId });
    await addSystemMessage(conversation.customerUserId, conversation.performerUserId, `${role === "customer" ? "Замовник" : "Виконавець"} виставив умови «${result.title}» ${result.number}`, result.id);
    return Response.json({ deal: result }, { status: 201 });
  } catch (error) {
    return failure(error, request);
  }
}
