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

/** Профіль виконавця зі сторінки /p/<id> веде на `/?open=performer:<id>`, де id має вигляд `me-<userId>`. */
const PERFORMER_ID = /^me-[A-Za-z0-9_-]{1,64}$/;

export const performerLinkHref = (id: string): string => `/?open=${encodeURIComponent(`performer:${id}`)}`;

/** id виконавця з `performer:<id>`; усе, що не схоже на id акаунта, відкидаємо. */
export const parsePerformerLink = (raw: string): string | null => (PERFORMER_ID.test(raw) ? raw : null);

export type PerformerLinkStep = "wait" | "deal" | "compose";

/**
 * Що робити з `performer:<id>` для людини, яка вже увійшла. Запити ще вантажаться: чекаємо. Є відкритий запит: пропонуємо
 * угоду цьому виконавцю (розмова з наміром «угода»). Немає: розгортаємо поле запиту з підказкою, як «Запропонувати роботу».
 */
export const performerLinkStep = ({ requests }: { requests: { status: string }[] | null }): PerformerLinkStep => {
  if (requests === null) return "wait";
  return requests.some((request) => request.status === "open") ? "deal" : "compose";
};
