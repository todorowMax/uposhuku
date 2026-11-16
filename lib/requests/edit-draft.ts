// lib/requests/edit-draft.ts
//
// Правка свого запиту: з чого складається форма, чи є що зберігати, яку чернетку слати на PATCH.
// Чисті функції без React і браузера; екран у `components/requests/edit-request-screen.tsx`.

import { REQUEST_TEXT_MAX, REQUEST_TEXT_MIN, type Deadline, type RequestDraft, type RequestFile, type RequestTag } from "./types";

/** Що людина бачить у формі правки; чипи умов і теги мапляться в нього без втрат. */
export interface EditForm {
  text: string;
  /** Усі теги запиту: з тексту й додані вручну, без прибраних. */
  tagIds: string[];
  files: RequestFile[];
  budget: number | null;
  deadline: Deadline | null;
  /** Своя дата «до»; коли вона є, готовий строк не враховується. */
  deadlineDate: string | null;
  cityId: string | null;
  channel: boolean;
}

/**
 * Початковий стан тегів форми за збереженим запитом. Теги з тексту форма знаходить сама, тому:
 * тег із запиту, якого в тексті немає, був доданий вручну; тег, який у тексті є, а в запиті його нема,
 * людина колись прибрала, його не воскрешаємо.
 */
export const initialTagState = (mentionIds: readonly string[], tags: readonly RequestTag[]): { added: string[]; dismissed: string[] } => {
  const saved = new Set(tags.map((tag) => tag.id));
  const mentioned = new Set(mentionIds);
  return {
    added: tags.map((tag) => tag.id).filter((id) => !mentioned.has(id)),
    dismissed: [...mentioned].filter((id) => !saved.has(id)),
  };
};

/**
 * Запит без міста в списку й на карті показується «Віддалено»: «віддалено» і «не вказано» в базі одне (`cityId` порожній).
 * Тому чип «Де» при відкритті правки показує «Віддалено», коли міста немає. Збереження даних не міняє: `cityId` лишається порожнім.
 */
export const initialRemote = (cityId: string | null | undefined): boolean => !cityId;

/** Збережений запит у стані форми. */
export const formFromRequest = (request: RequestDraft): EditForm => ({
  text: request.text,
  tagIds: request.tags.map((tag) => tag.id),
  files: request.files,
  budget: request.budget ?? null,
  deadline: request.deadline ?? null,
  deadlineDate: request.deadlineDate ?? null,
  cityId: request.cityId ?? null,
  channel: request.channelOptIn !== false,
});

/** Чернетка для сервера: текст обрізаємо, назви тегів беремо зі збережених, для нових зі словника. */
export const draftFromForm = (form: EditForm, saved: readonly RequestTag[], labelOf: (id: string) => string): RequestDraft => {
  const known = new Map(saved.map((tag) => [tag.id, tag.label]));
  return {
    text: form.text.trim(),
    tags: form.tagIds.map((id) => ({ id, label: known.get(id) ?? labelOf(id) })),
    files: form.files,
    budget: form.budget,
    deadline: form.deadline,
    deadlineDate: form.deadlineDate,
    cityId: form.cityId,
    channelOptIn: form.channel,
  };
};

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((item, index) => item === b[index]);
const fileKeys = (files: readonly RequestFile[]) => files.map((file) => `${file.name}:${file.size}`);

/** Строк змінено? Зі своєю датою готовий строк це знімок і в порівнянні не бере участі. */
const deadlineChanged = (before: EditForm, form: EditForm) => before.deadlineDate !== form.deadlineDate || (form.deadlineDate === null && before.deadline !== form.deadline);

/** Форма відрізняється від збереженого запиту? Порядок тегів не важливий, порядок файлів важливий. */
export const formChanged = (saved: RequestDraft, form: EditForm): boolean => {
  const before = formFromRequest(saved);
  return (
    before.text !== form.text.trim() ||
    before.budget !== form.budget ||
    deadlineChanged(before, form) ||
    before.cityId !== form.cityId ||
    before.channel !== form.channel ||
    !sameList([...before.tagIds].sort(), [...form.tagIds].sort()) ||
    !sameList(fileKeys(before.files), fileKeys(form.files))
  );
};

/** Текст у межах, які приймає сервер (`parseDraft`). */
export const editTextValid = (text: string): boolean => {
  const length = text.trim().length;
  return length >= REQUEST_TEXT_MIN && length <= REQUEST_TEXT_MAX;
};

/** «Зберегти» доступна, коли є що зберігати й текст проходить перевірку. */
export const canSaveEdit = (saved: RequestDraft, form: EditForm): boolean => editTextValid(form.text) && formChanged(saved, form);
