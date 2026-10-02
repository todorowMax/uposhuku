// lib/feed/types.ts
//
// Стрічка запитів виконавця: що йому показуємо й що він відповідає.
// Контракт спільний для сервера й клієнта.

export interface FeedTag {
  id: string;
  label: string;
  /** Збігається з тегами профілю виконавця: підсвічуємо. */
  matched: boolean;
}

/** Відгук виконавця на запит: те саме, що замовник потім бачить у пропозиціях. */
export interface MyResponse {
  /** Ціна в гривнях; null — «після обговорення». */
  price: number | null;
  days: number;
  message: string;
  createdAt: string;
}

export interface FeedItem {
  id: string;
  text: string;
  tags: FeedTag[];
  /** Місто замовника або «Віддалено». */
  place: string;
  /** Бюджет, якщо замовник його вказав. */
  budget: string | null;
  /** Коли потрібен результат: «Терміново, до 3 днів». */
  deadline: string | null;
  createdAt: string;
  /** Скільки виконавців уже відгукнулось. */
  responses: number;
  /** Скільки тегів запиту закриває профіль. */
  matchedTags: number;
  response: MyResponse | null;
}

export const RESPONSE_LIMITS = { message: 600, minDays: 1, maxDays: 365, maxPrice: 10_000_000 } as const;

/** Запит на карті: той самий опис, що в стрічці, плюс точка. Без точки — «Віддалено». */
export interface MapRequest extends FeedItem {
  point: { lat: number; lng: number } | null;
  /** Це запит самої людини: на карті показуємо інакше, відгукнутися на нього не можна. */
  own: boolean;
}
