// lib/feed/types.ts
//
// Стрічка запитів виконавця: що йому показуємо й що він відповідає.
// Контракт спільний для сервера й клієнта.

import type { RequestFile } from "@/lib/requests/types";

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
  /** Без міста («Віддалено»). */
  remote: boolean;
  /** Місто запиту збігається з містом профілю виконавця. */
  sameCity: boolean;
  /** Бюджет, якщо замовник його вказав. */
  budget: string | null;
  /** Підпис готового строку: «Терміново, до 3 днів» (за ним працює фільтр «Терміново»; для показу див. `deadlineDate`). */
  deadline: string | null;
  /** Своя дата «до» (`YYYY-MM-DD`); null — готовий строк. Підпис для людини дає `deadlineText` (`lib/requests/format.ts`). */
  deadlineDate: string | null;
  createdAt: string;
  /** ISO-час останньої правки автором; null, якщо запит не змінювали. */
  editedAt: string | null;
  /** Файли запиту: стрічка й карта віддаються лише виконавцю з опублікованим профілем, тож список бачить він (байти: `/api/request-files/<id>`). Необов'язкове: власний запит, який карта збирає зі стору (`ownRequestOnMap`), файлів не несе. */
  files?: RequestFile[];
  /** Скільки виконавців уже відгукнулось. */
  responses: number;
  /** Скільки тегів запиту закриває профіль. */
  matchedTags: number;
  response: MyResponse | null;
}

export const RESPONSE_LIMITS = { message: 600, minDays: 1, maxDays: 365, maxPrice: 10_000_000 } as const;

/** Запит на карті: той самий опис, що в стрічці, плюс точка. Запит без міста («Віддалено») стоїть у центрі України. */
export interface MapRequest extends FeedItem {
  point: { lat: number; lng: number };
  /** Це запит самої людини: на карті показуємо інакше, відгукнутися на нього не можна. */
  own: boolean;
}

/** Сторінка стрічки: наступний курсор (null, коли далі нічого) і скільки всього відкритих чужих запитів. */
export interface FeedPage {
  items: FeedItem[];
  next: string | null;
  total: number;
}
