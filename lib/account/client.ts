// lib/account/client.ts
//
// Браузерна сторона самообслуговування з даними: завантажити виписку, видалити акаунт. Стани двох екранів і виклики
// /api/account/*. Помилки API приходять як problem+json (див. lib/auth/client.ts).

import type { DeleteBlocker } from "@/lib/account/deletion";
import { ApiError, logout, problemError } from "@/lib/auth/client";
import { createStore } from "@/lib/store";

export const exportScreenStore = createStore(false);
export const deleteScreenStore = createStore(false);

/** Відмова видалити: у відповіді лежить список того, що заважає. */
export class DeleteBlockedError extends ApiError {
  readonly blockers: DeleteBlocker[];

  constructor(message: string, blockers: DeleteBlocker[]) {
    super(message, "delete_blocked");
    this.blockers = blockers;
  }
}

export interface DeleteStatus {
  blockers: DeleteBlocker[];
  needsCode: boolean;
}

const NO_NETWORK = "Немає зв'язку. Перевірте інтернет і спробуйте ще раз.";

const send = async (input: string, init?: RequestInit): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError(NO_NETWORK);
  }
};

const json = async <T,>(response: Response): Promise<T> => {
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string; code?: string; blockers?: DeleteBlocker[] }) | null;
  if (response.ok) return data as T;
  if (data?.code === "delete_blocked") throw new DeleteBlockedError(data.detail ?? "Акаунт поки не можна видалити.", data.blockers ?? []);
  throw problemError(data);
};

export const fetchDeleteStatus = async (): Promise<DeleteStatus> => json<DeleteStatus>(await send("/api/account/delete"));

/** Просить код на пошту. false: лист щойно надсилали, нового не буде. */
export const requestDeletionCode = async (): Promise<boolean> => (await json<{ sent: boolean }>(await send("/api/account/delete/code", { method: "POST" }))).sent;

export const confirmDeletion = async (input: { confirm: string; code?: string }): Promise<void> => {
  await json<{ deleted: boolean }>(await send("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
  // Сесії вже немає на сервері; чистимо стан браузера й повертаємо людину на головну з порожнім станом.
  await logout().catch(() => undefined);
  window.location.assign("/");
};

/** Завантажує виписку даних файлом: запит із сесією, потім збереження blob (помилку, наприклад ліміт, показуємо текстом). */
export const downloadMyData = async (): Promise<void> => {
  const response = await send("/api/account/export");
  if (!response.ok) throw problemError((await response.json().catch(() => null)) as { detail?: string; title?: string; code?: string } | null);
  const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "findlyfy-my-data.json";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
