// lib/map/deep-link.ts
//
// Посилання `/?open=…` (бот, канал, сторінка запиту /zapyt/<id>): чисті рішення, що робити далі. Сам перехід виконує
// components/map/deep-link-sync.tsx.

/** Куди повернути після входу: те саме посилання, яке не вдалося виконати гостю (вхід через Google перезавантажує сторінку). */
export const deepLinkNext = (open: string): string =>
  `/?open=${encodeURIComponent(open)}`;

export type RequestLinkStep = "wait" | "create-profile" | "open";

/**
 * Що робити з `request:<id>` для людини, яка вже увійшла: запити в стрічці бачить лише виконавець з опублікованим профілем.
 * Поки профіль вантажиться: чекаємо. Без опублікованого профілю: відкриваємо його редактор і чекаємо публікації,
 * після неї посилання відкриває запит (людина повертається саме до нього).
 */
export const requestLinkStep = (profile: {
  status: "loading" | "ready";
  published: boolean;
}): RequestLinkStep => {
  if (profile.status === "loading") return "wait";
  return profile.published ? "open" : "create-profile";
};
