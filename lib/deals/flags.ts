// lib/deals/flags.ts
//
// Режим безпечної угоди: чисті функції без читання середовища. Сервер бере значення зі змінних
// (lib/server/safe-deal.ts), машина станів і клієнт отримують рішення параметром.

/**
 * off: безпечної угоди немає ні для кого (типово). allowlist: лише для пошт зі списку SAFE_DEAL_USERS.
 * on: для всіх, і лише тоді юридичні тексти про неї з'являються на сайті.
 */
export type SafeDealMode = "off" | "allowlist" | "on";

/** Невідоме чи порожнє значення це `off`: помилка в змінній не вмикає гроші. */
export const parseSafeDealMode = (raw: string | undefined): SafeDealMode => {
  const value = raw?.trim().toLowerCase();
  return value === "allowlist" || value === "on" ? value : "off";
};

/** Пошти через кому, у нижньому регістрі, без порожніх. */
export const parseSafeDealUsers = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

/** Чи доступна безпечна угода цій пошті в цьому режимі. */
export const safeDealAllowed = (mode: SafeDealMode, users: string[], email: string | null | undefined): boolean => {
  if (mode === "on") return true;
  if (mode === "off" || !email) return false;
  return users.includes(email.trim().toLowerCase());
};
