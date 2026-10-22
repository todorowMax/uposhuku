// GET /api/conversations/:id/attachments/:attachmentId — фото з чату. Віддаємо лише
// замовнику й виконавцю цієї розмови, кеш приватний.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { accessibleConversation, findChatAttachment } from "@/lib/server/chat-repo";
import { getBucket } from "@/lib/server/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const { id, attachmentId } = await params;
  const access = await accessibleConversation(id, user.id);
  if (!access) return problem(404, "Файл не знайдено");
  const row = await findChatAttachment(access.conversation.id, attachmentId);
  if (!row) return problem(404, "Файл не знайдено");
  const object = await getBucket().get(row.key);
  if (!object) return problem(404, "Файл не знайдено");
  return new Response(object.body, {
    headers: { "content-type": row.mime, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
