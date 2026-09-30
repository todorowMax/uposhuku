// lib/requests/draft.ts
//
// Чернетка запиту в браузері. Потрібна, щоб запит пережив вхід через
// Google: там сторінка йде на інший сайт і повертається, і все, що було в
// пам'яті, зникає. Прапорець pending каже «після входу — опублікувати».
// localStorage може бути недоступний (приватне вікно), тож усе в try.

import type { RequestDraft } from "./types";

const KEY = "vm:request-draft";

interface Stored {
  draft: RequestDraft;
  pending: boolean;
}

export const saveDraft = (draft: RequestDraft, pending: boolean) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ draft, pending } satisfies Stored));
  } catch {
    // Без сховища чернетка житиме лише до перезавантаження.
  }
};

export const loadDraft = (): Stored | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
};

export const clearDraft = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Нема що чистити.
  }
};
