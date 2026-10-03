// GET /api/uploads/photos/<користувач>/<uuid>.<розширення> — публічне фото з R2.
// Інші префікси (приватні файли запитів і чату) віддаватимемо з перевіркою доступу.

import { problem } from "@/lib/api/problem";
import { PHOTO_PREFIX, getBucket } from "@/lib/server/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!key.startsWith(PHOTO_PREFIX) || key.includes("..")) return problem(404, "Файл не знайдено");
  const object = await getBucket().get(key);
  if (!object) return problem(404, "Файл не знайдено");
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
