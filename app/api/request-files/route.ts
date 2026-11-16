// POST /api/request-files — завантажити файл до запиту (тіло — сам файл, ім'я в заголовку `x-file-name`,
// закодоване через encodeURIComponent). Лише з входом. Тип визначаємо за вмістом, а не за Content-Type.
// Відповідь {file}: його id йде в чернетку запиту (`files: [{id}]`), байти приєднуються до запиту при збереженні.

import { problem } from "@/lib/api/problem";
import { REQUEST_FILE_MAX_BYTES, formatFileSize } from "@/lib/requests/file-types";
import { readBodyLimited } from "@/lib/server/read-body";
import { saveRequestFile } from "@/lib/server/request-files";
import { route } from "@/lib/server/route";

const decodeName = (header: string | null): string => {
  try {
    return decodeURIComponent(header ?? "");
  } catch {
    return "";
  }
};

export const POST = route({ auth: "user", rate: "upload" }, async ({ request, user }) => {
  const bytes = await readBodyLimited(request, REQUEST_FILE_MAX_BYTES);
  if (!bytes) return problem(413, "Файл завеликий", `Файл до ${formatFileSize(REQUEST_FILE_MAX_BYTES)}.`);
  const result = await saveRequestFile(user.id, { name: decodeName(request.headers.get("x-file-name")), bytes });
  return typeof result === "string" ? problem(400, "Файл не прийнято", result) : Response.json({ file: result }, { status: 201 });
});
