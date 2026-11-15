// GET /api/conversations/:id/attachments/:attachmentId — фото з чату. Віддаємо лише
// замовнику й виконавцю цієї розмови, кеш приватний.

import { problem } from "@/lib/api/problem";
import { accessibleConversation, findChatAttachment } from "@/lib/server/chat-repo";
import { getBucket } from "@/lib/server/uploads";
import { route } from "@/lib/server/route";

export const GET = route<"user", undefined, { id: string; attachmentId: string }>({ auth: "user" }, async ({ user, params }) => {
  const { id, attachmentId } = params;
  const access = await accessibleConversation(id, user.id);
  if (!access) return problem(404, "Файл не знайдено");
  const row = await findChatAttachment(access.conversation.id, attachmentId);
  if (!row) return problem(404, "Файл не знайдено");
  const object = await getBucket().get(row.key);
  if (!object) return problem(404, "Файл не знайдено");
  return new Response(object.body, {
    headers: { "content-type": row.mime, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
});
