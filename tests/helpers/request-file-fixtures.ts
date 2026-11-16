// tests/helpers/request-file-fixtures.ts
//
// Файли запитів для тестів: короткі байти з правильними першими байтами (тип визначається за вмістом)
// і хелпер, що завантажує файл від імені людини так само, як маршрут `POST /api/request-files`.

import type { RequestFile } from "@/lib/requests/types";
import { saveRequestFile } from "@/lib/server/request-files";

/** `%PDF-1.4`. */
export const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
/** Підпис PNG і трохи байтів. */
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
export const textBytes = (text: string) => new TextEncoder().encode(text);

/** Завантажує файл від імені `userId`; невдача (рядок із причиною) кидає помилку, щоб тест не пропустив її мовчки. */
export const attach = async (userId: string, name: string, bytes: Uint8Array): Promise<RequestFile> => {
  const saved = await saveRequestFile(userId, { name, bytes });
  if (typeof saved === "string") throw new Error(saved);
  return saved;
};
