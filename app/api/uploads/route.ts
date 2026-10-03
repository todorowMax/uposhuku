// POST /api/uploads — завантажити фото в R2 (JPEG, PNG або WebP, до 300 КБ).
// Тіло — сам файл (Content-Type: image/*) або multipart з полем `file`.
// Відповідь: {url}. Фото профілю браузер стискає до відправки.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { failure } from "@/lib/server/route";
import { PHOTO_MAX_BYTES, putPhoto } from "@/lib/server/uploads";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > PHOTO_MAX_BYTES * 2) return problem(413, "Файл завеликий", "Фото до 300 КБ.");
    let bytes: Uint8Array;
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) return problem(400, "Файл не передано");
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      bytes = new Uint8Array(await request.arrayBuffer());
    }
    const result = await putPhoto(user.id, bytes);
    return typeof result === "string" ? problem(400, "Файл не прийнято", result) : Response.json(result, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
