// lib/requests/files-client.ts
//
// Браузерна сторона файлів запиту: завантаження одного файла й відмова від ще не доданого. Сервер перевіряє все сам
// (`app/api/request-files`); тут лише швидка перевірка розміру, щоб не вантажити зайве, і зрозуміла помилка.

import { ApiError, problemError } from "@/lib/auth/client";
import { REQUEST_FILE_MAX_BYTES, formatFileSize } from "./file-types";
import type { RequestFile } from "./types";

const NETWORK_ERROR = "Немає зв'язку. Перевірте інтернет і спробуйте ще раз.";

/** Завантажує файл до збереження запиту. Повертає опис, id якого йде в чернетку запиту (`files: [{id}]`). */
export const uploadRequestFile = async (file: File): Promise<RequestFile> => {
  if (file.size > REQUEST_FILE_MAX_BYTES) throw new ApiError(`Файл завеликий: до ${formatFileSize(REQUEST_FILE_MAX_BYTES)}.`);
  let response: Response;
  try {
    response = await fetch("/api/request-files", { method: "POST", headers: { "x-file-name": encodeURIComponent(file.name) }, body: file });
  } catch {
    throw new ApiError(NETWORK_ERROR);
  }
  const data = (await response.json().catch(() => null)) as { file?: RequestFile; detail?: string; title?: string; code?: string } | null;
  if (!response.ok || !data?.file) throw problemError(data);
  return data.file;
};

/** Прибирає файл, який людина завантажила, але не додала до запиту. Збій не страшний: осиротілі прибирає tick. */
export const discardRequestFile = async (id: number): Promise<void> => {
  try {
    await fetch(`/api/request-files/${id}`, { method: "DELETE" });
  } catch {
    // Без зв'язку файл лишиться до чистки через добу.
  }
};
