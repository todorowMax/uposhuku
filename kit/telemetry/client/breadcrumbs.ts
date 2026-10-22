"use client";

// kit/telemetry/client/breadcrumbs.ts
//
// Останні кроки людини перед падінням: сторінки й події аналітики. У звіті
// про помилку це відповідь на «що вона робила перед цим». Лише в пам'яті,
// нічого не зберігається.

export interface Breadcrumb {
  /** Мілісекунди від початку завантаження сторінки. */
  t: number;
  type: "page" | "event" | "click";
  name: string;
}

const LIMIT = 20;
const trail: Breadcrumb[] = [];

export const addBreadcrumb = (type: Breadcrumb["type"], name: string): void => {
  trail.push({ t: typeof performance !== "undefined" ? Math.round(performance.now()) : 0, type, name: name.slice(0, 100) });
  if (trail.length > LIMIT) trail.shift();
};

export const getBreadcrumbs = (): Breadcrumb[] => [...trail];

export const clearBreadcrumbs = (): void => {
  trail.length = 0;
};
