// /api/conversations — розмови замовника з виконавцями.
// GET — мої розмови в обох ролях; POST {performerId} — відкрити розмову
// (або отримати вже наявну).

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { getOrCreateConversation, listConversations, performerKnown } from "@/lib/server/chat-repo";
import { pushUser } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    return Response.json({ conversations: await listConversations(user.id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  const performerId = typeof body?.performerId === "string" ? body.performerId.slice(0, 80) : "";
  try {
    const known = await performerKnown(performerId, user.id);
    if (!known) return problem(404, "Виконавця не знайдено", "Профіль не опубліковано або це ваш власний профіль.");
    const conversation = await getOrCreateConversation(user.id, performerId, known.userId);
    // Нова розмова з'являється в списку другої сторони одразу.
    pushUser(known.userId, { t: "message", conversationId: conversation.id });
    return Response.json({ conversation: { id: conversation.id, performerId, role: "customer" as const } }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
