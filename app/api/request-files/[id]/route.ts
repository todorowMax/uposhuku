// GET /api/request-files/:id — файл запиту. Віддаємо автору запиту, виконавцю з опублікованим профілем (поки запит
// відкритий) і виконавцю, що вже відгукнувся; гість і решта отримують 401/404, як і для неіснуючого файла.
// Тип беремо з нашого запису, а не з клієнта; усе, крім зображень, іде на завантаження.
// DELETE /api/request-files/:id — прибрати власний файл, який ще не додано до збереженого запиту.

import { problem } from "@/lib/api/problem";
import { deletePendingRequestFile, readableRequestFile } from "@/lib/server/request-files";
import { route } from "@/lib/server/route";
import { getBucket } from "@/lib/server/uploads";

const parseId = (raw: string): number | null => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

/** Ім'я для заголовка: ASCII-запасний варіант і UTF-8 за RFC 5987. */
const disposition = (kind: "inline" | "attachment", name: string) => {
  const ascii = [...name].map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126 || char === '"' || char === "\\" ? "_" : char)).join("");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

export const GET = route<"user", undefined, { id: string }>({ auth: "user" }, async ({ user, params }) => {
  const id = parseId(params.id);
  const file = id === null ? null : await readableRequestFile(user.id, id);
  if (!file?.key) return problem(404, "Файл не знайдено");
  const object = await getBucket().get(file.key);
  if (!object) return problem(404, "Файл не знайдено");
  const image = file.type.startsWith("image/");
  return new Response(object.body, {
    headers: {
      "content-type": file.type,
      "content-disposition": disposition(image ? "inline" : "attachment", file.name),
      "content-length": String(file.size),
      "cache-control": "private, no-cache",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
});

export const DELETE = route<"user", undefined, { id: string }>({ auth: "user" }, async ({ user, params }) => {
  const id = parseId(params.id);
  if (id === null || !(await deletePendingRequestFile(user.id, id))) return problem(404, "Файл не знайдено");
  return new Response(null, { status: 204 });
});
