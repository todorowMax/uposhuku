// /api/conversations/:id/read — POST: людина відкрила стрічку й бачить усе, що в ній є.
// Ставить її мітку прочитання на «зараз»; доступ лише замовнику й виконавцю цієї розмови.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { accessibleConversation, markConversationRead } from "@/lib/server/chat-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { pushUser } from "@/lib/server/realtime";
import { failure } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

export const POST = async (request: Request, { params }: Ctx) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const limited = await rateLimited("conversationRead", user.id);
  if (limited) return limited;
  try {
    const access = await accessibleConversation((await params).id, user.id);
    if (!access) return problem(404, "Розмову не знайдено");
    await markConversationRead(access.conversation.id, access.role);
    // Інші вкладки цієї людини перечитають список: непрочитане там теж гасне.
    pushUser(user.id, { t: "message", conversationId: access.conversation.id });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
