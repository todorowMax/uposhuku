// /api/conversations/:id/messages — переписка.
// GET ?since=<мс> — повідомлення новіші за мітку (опитування); POST {text} —
// написати. Доступ лише замовнику й виконавцю цієї розмови.

import { problem, readJson } from "@/lib/api/problem";
import { CHAT_TEXT_MAX } from "@/lib/chat/types";
import { getSessionUser } from "@/lib/server/auth";
import { accessibleConversation, addMessage, listMessages } from "@/lib/server/chat-repo";
import { pushUser } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const access = await accessibleConversation((await params).id, user.id);
    if (!access) return problem(404, "Розмову не знайдено");
    const since = Number(new URL(request.url).searchParams.get("since") ?? 0);
    return Response.json({ role: access.role, messages: await listMessages(access.conversation.id, Number.isFinite(since) ? since : 0) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, CHAT_TEXT_MAX) : "";
  if (!text) return problem(400, "Порожнє повідомлення");
  try {
    const access = await accessibleConversation((await params).id, user.id);
    if (!access) return problem(404, "Розмову не знайдено");
    const message = await addMessage(access.conversation.id, access.role, text);
    // Обидві сторони (і всі їхні вкладки) дізнаються одразу.
    const event = { t: "message", conversationId: access.conversation.id } as const;
    pushUser(access.conversation.customerUserId, event);
    pushUser(access.conversation.performerUserId, event);
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
