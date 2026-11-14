// POST /api/conversations/:id/deals — виставити умови прямо в розмові (без запиту).
// Будь-яка сторона; друга приймає чи відхиляє. Тіло: {title, description?, method, stages[]}.

import { problem, readJson } from "@/lib/api/problem";
import { performerIdOf } from "@/lib/deals/parties";
import type { DealMethod } from "@/lib/deals/types";
import { getSessionUser } from "@/lib/server/auth";
import { hasActivePayout } from "@/lib/server/deal-parties";
import { escrowGate } from "@/lib/server/escrow-gate";
import { safeDealEnabledFor } from "@/lib/server/safe-deal";
import { accessibleConversation, addSystemMessage, OTHER_SIDE_GONE, otherSideGone } from "@/lib/server/chat-repo";
import { proposeDirectDeal, SELF_DEAL } from "@/lib/server/deal-repo";
import { notifyLater } from "@/lib/server/notify";
import { getProfile } from "@/lib/server/profile-repo";
import { pushUser } from "@/lib/server/realtime";
import { cryptoGate, legalGate } from "@/lib/server/legal-gate";
import { phoneGateForRole } from "@/lib/server/phone-gate";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { dealNotice } from "@/lib/telegram/notices";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Стеля ескроу для угоди цього способу: null для інших способів, відповідь-відмова, коли ескроу недоступне.
 * Перша дія з USDT потребує підтвердження ризиків: його перевіряємо раніше за прапорець.
 */
const escrowLimit = async (input: { method: DealMethod; user: { id: string; email: string }; performerUserId: string }): Promise<number | null | Response> => {
  const { method, user, performerUserId } = input;
  if (method !== "escrow") return null;
  const risk = await cryptoGate(user.id);
  if (risk) return risk;
  const gate = await escrowGate({ email: user.email, performerUserId });
  return typeof gate === "string" ? problem(409, "Ескроу недоступне", gate) : gate.max;
};

/** Способ оплати з тіла запиту; невідоме значення означає прямий переказ. */
const methodOf = (body: Record<string, unknown> | null): DealMethod => (body?.method === "safe" || body?.method === "escrow" ? body.method : "direct");

/** Відмова до створення умов: другу сторону видалено, або замовник ще не підтвердив телефон (виконавця, що виставляє умови, ворота не чіпають). */
const conversationRefusal = async (input: { conversation: Parameters<typeof otherSideGone>[0]; role: "customer" | "performer"; user: { id: string; email: string } }): Promise<Response | null> => {
  const { conversation, role, user } = input;
  if (await otherSideGone(conversation, role)) return problem(409, "Акаунт видалено", OTHER_SIDE_GONE);
  return phoneGateForRole(role, user);
};

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const refused = (await rateLimited("dealCreate", user.id)) ?? (await legalGate(user.id));
    if (refused) return refused;
    const access = await accessibleConversation((await params).id, user.id);
    if (!access) return problem(404, "Розмову не знайдено");
    const { conversation, role } = access;
    const refusal = await conversationRefusal({ conversation, role, user });
    if (refusal) return refusal;
    if (!conversation.performerUserId) return problem(400, "Умови не виставлено", "З демо-виконавцем угоду оформити не можна.");
    const body = await readJson(request);
    const method = methodOf(body);
    const safeEnabled = await safeDealEnabledFor(user.email);
    if (method === "safe" && !safeEnabled) return problem(409, "Безпечна угода ще недоступна");
    // Ескроу: прапорець у того, хто створює (будь-яка сторона), фабрика, підтверджений гаманець виконавця й стеля з контракту.
    const escrow = await escrowLimit({ method, user, performerUserId: conversation.performerUserId });
    if (escrow instanceof Response) return escrow;
    const escrowMax = escrow;
    if (conversation.performerUserId === conversation.customerUserId) return problem(400, "Умови не виставлено", SELF_DEAL);
    const rawStages = Array.isArray(body?.stages) ? body.stages.slice(0, 6) : [];
    const profile = await getProfile(conversation.performerUserId);
    // id виконавця виводимо з акаунта, а не довіряємо збереженому рядку розмови.
    const performerId = performerIdOf(conversation.performerUserId);
    const result = await proposeDirectDeal(
      { ...conversation, performerId },
      role,
      {
        title: text(body?.title, 80),
        description: text(body?.description, 1000),
        // Довжину критеріїв перевіряє proposeDirectDeal: мовчки обрізати їх не можна.
        criteria: typeof body?.criteria === "string" ? body.criteria : undefined,
        method,
        performer: {
          id: performerId,
          name: profile?.name ?? "Виконавець",
          photo: undefined,
          avatarIndex: 0,
          specialty: profile?.specialty ?? "",
          // ФОП визначаємо самі: цьому полю з клієнта не вірити.
          fop: await hasActivePayout(conversation.performerUserId),
        },
        stages: rawStages.map((stage: Record<string, unknown>) => ({
          title: text(stage?.title, 60),
          amount: typeof stage?.amount === "number" ? Math.round(stage.amount) : NaN,
          days: typeof stage?.days === "number" ? Math.round(stage.days) : NaN,
        })),
      },
      { safeEnabled, escrowMax },
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
};
