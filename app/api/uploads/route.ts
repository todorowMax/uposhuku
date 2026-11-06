// POST /api/uploads — завантажити фото в R2 (JPEG, PNG або WebP, до 300 КБ).
// Тіло — сам файл (Content-Type: image/*) або multipart з полем `file`.
// Відповідь: {url}. Фото профілю браузер стискає до відправки.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { rateLimited } from "@/lib/server/rate-limit";
import { readBodyLimited } from "@/lib/server/read-body";
import { failure } from "@/lib/server/route";
import { PHOTO_MAX_BYTES, putPhoto } from "@/lib/server/uploads";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("upload", user.id);
    if (limited) return limited;
    // Стеля вдвічі більша за фото: запас на multipart-обгортку; точну вагу файлу перевіряє putPhoto.
    const raw = await readBodyLimited(request, PHOTO_MAX_BYTES * 2);
    if (!raw) return problem(413, "Файл завеликий", "Фото до 300 КБ.");
    let bytes = raw;
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const file = (await new Response(new Blob([raw]), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData()).get("file");
      if (!(file instanceof File)) return problem(400, "Файл не передано");
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    const result = await putPhoto(user.id, bytes);
    return typeof result === "string" ? problem(400, "Файл не прийнято", result) : Response.json(result, { status: 201 });
  } catch (error) {
    return failure(error, request);
  }
}
