// /api/conversations/:id/messages — переписка.
// GET ?since=<мс> — повідомлення новіші за мітку (опитування); POST {text} —
// написати. Доступ лише замовнику й виконавцю цієї розмови.

import { problem, readJson } from "@/lib/api/problem";
import { CHAT_PHOTOS_MAX, CHAT_TEXT_MAX } from "@/lib/chat/types";
import { getSessionUser } from "@/lib/server/auth";
import { accessibleConversation, addMessage, claimableAttachments, listMessages } from "@/lib/server/chat-repo";
import { pushUser } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";
import { mentionsContacts } from "@/lib/chat/contacts";
import { notifyLater } from "@/lib/server/notify";
import { getProfile } from "@/lib/server/profile-repo";
import { messageNotice } from "@/lib/telegram/notices";

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
    return failure(error, request);
  }
}

export async function POST(request: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, CHAT_TEXT_MAX) : "";
  const requested = Array.isArray(body?.attachmentIds) ? [...new Set(body.attachmentIds.filter((id: unknown): id is string => typeof id === "string"))].slice(0, CHAT_PHOTOS_MAX) : [];
  if (!text && requested.length === 0) return problem(400, "Порожнє повідомлення");
  try {
    const access = await accessibleConversation((await params).id, user.id);
    if (!access) return problem(404, "Розмову не знайдено");
    const attachmentIds = await claimableAttachments(access.conversation.id, user.id, requested);
    if (!text && attachmentIds.length === 0) return problem(400, "Порожнє повідомлення");
    const message = await addMessage(access.conversation.id, access.role, text, { attachmentIds });
    serverEvent(EVENTS.messageSent, { role: access.role, has_contacts: mentionsContacts(text) }, user.id, "/api/conversations/messages");
    // Обидві сторони (і всі їхні вкладки) дізнаються одразу.
    const event = { t: "message", conversationId: access.conversation.id } as const;
    pushUser(access.conversation.customerUserId, event);
    pushUser(access.conversation.performerUserId, event);
    // Співрозмовнику в Telegram: з іменем відправника, якщо він не на сайті.
    const recipient = access.role === "customer" ? access.conversation.performerUserId : access.conversation.customerUserId;
    const fromName = access.role === "performer" ? ((await getProfile(user.id))?.name || "Виконавець") : (user.name?.split(/\s+/)[0] || "Замовник");
    notifyLater(recipient, messageNotice({ conversationId: access.conversation.id, fromName, text: text || "📷 Фото" }));
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return failure(error, request);
  }
}
