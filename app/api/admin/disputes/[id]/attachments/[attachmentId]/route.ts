// GET /api/admin/disputes/:dealId/attachments/:attachmentId — фото з переписки спору.
// Лише адміністратору й лише з розмови цієї угоди; кеш приватний.

import { problem } from "@/lib/api/problem";
import { getAdmin } from "@/lib/server/admin";
import { findDisputeAttachment } from "@/lib/server/admin-repo";
import { failure } from "@/lib/server/route";
import { getBucket } from "@/lib/server/uploads";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    if (!(await getAdmin())) return problem(404, "Не знайдено");
    const { id, attachmentId } = await params;
    const row = await findDisputeAttachment(id, attachmentId);
    if (!row) return problem(404, "Не знайдено");
    const object = await getBucket().get(row.key);
    if (!object) return problem(404, "Не знайдено");
    return new Response(object.body, {
      headers: { "content-type": row.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return failure(error, request);
  }
}
