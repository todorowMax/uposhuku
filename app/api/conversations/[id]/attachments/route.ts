// POST /api/conversations/:id/attachments — фото в чат (тіло — сам файл, його
// браузер стискає до 600 КБ). Відповідь {id, url}; до повідомлення прикріплюється
// через attachmentIds. Лише учасникам розмови.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { accessibleConversation, saveChatPhoto } from "@/lib/server/chat-repo";
import { failure } from "@/lib/server/route";
import { CHAT_PHOTO_MAX_BYTES } from "@/lib/server/uploads";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const access = await accessibleConversation((await params).id, user.id);
    if (!access) return problem(404, "Розмову не знайдено");
    if (Number(request.headers.get("content-length") ?? 0) > CHAT_PHOTO_MAX_BYTES * 2) return problem(413, "Файл завеликий", "Фото до 600 КБ після стиснення.");
    const result = await saveChatPhoto(access.conversation.id, user.id, new Uint8Array(await request.arrayBuffer()));
    return typeof result === "string" ? problem(400, "Фото не прийнято", result) : Response.json(result, { status: 201 });
  } catch (error) {
    return failure(error, request);
  }
}
