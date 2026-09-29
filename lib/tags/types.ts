// lib/tags/types.ts
//
// Словник тегів для підбору без ШІ: профілі, проєкти й запити описуються
// тими самими тегами, а текст запиту перетворюється на теги за синонімами.
// Як з цього рахується підбір, описано в документі «План MVP», розділ
// «Підбір без ШІ».

export type TagGroup =
  /** Що саме будуємо: сайт, Telegram-бот, CRM. */
  | "product"
  /** Що вміє продукт: онлайн-запис, оплата, кабінет. */
  | "feature"
  /** Для кого: медицина, ресторани, освіта. */
  | "industry"
  /** З чим інтегруємося: Нова Пошта, Monobank, Google Sheets. */
  | "integration"
  /** Чим будуємо: Lovable, Cursor, Next.js, Supabase. */
  | "tool"
  /** Послуги спеціалістів: дизайн, ревʼю коду, деплой. */
  | "service";

export interface TagDef {
  /** Стабільний ключ, латиницею: йде в базу й URL. */
  id: string;
  group: TagGroup;
  /** Назва в інтерфейсі, українською. */
  label: string;
  /**
   * Як люди пишуть про це в запитах: українською, російською, англійською,
   * транслітом і з типовими помилками. Назва й id шукаються й так, їх сюди
   * не повторюємо. Кожна фраза після нормалізації належить рівно одному
   * тегу, інакше підбір не знатиме, що людина мала на увазі.
   */
  synonyms: string[];
  /**
   * Ширший тег. Дитина й батько схожі на PARENT_SIMILARITY, «брати» з
   * одним батьком — на SIBLING_SIMILARITY.
   */
  parent?: string;
  /** Інші близькі теги зі схожістю від 0 до 1, коли правила батьків замало. */
  related?: Record<string, number>;
}

/** Telegram-бот ↔ Чат-бот. */
export const PARENT_SIMILARITY = 0.8;
/** Telegram-бот ↔ Viber-бот. */
export const SIBLING_SIMILARITY = 0.5;

type Options = Pick<TagDef, "parent" | "related">;

/** Короткий запис тегу, щоб словник читався як таблиця. */
export const tag =
  (group: TagGroup) =>
  (id: string, label: string, synonyms: string[], options: Options = {}): TagDef => ({
    id,
    group,
    label,
    synonyms,
    ...options,
  });
