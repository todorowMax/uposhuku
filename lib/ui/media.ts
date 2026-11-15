// lib/ui/media.ts
//
// Миттєві перевірки медіа-запитів для обробників подій і ефектів. Лише в браузері.

export const prefersReducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Вузький екран: бокові панелі стають шторками (breakpoint lg у DESIGN.md). */
export const isPhoneViewport = (): boolean => window.matchMedia("(max-width: 1023px)").matches;
