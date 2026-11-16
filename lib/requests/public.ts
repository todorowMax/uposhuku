// lib/requests/public.ts
//
// Публічна сторінка запиту (/zapyt/<id>): що з запиту можна показати без входу. Лише дані, які автор дозволив показувати
// (галочка «в канал»), без імені, пошти, телефона, id автора й файлів; контакти з тексту вирізані (`stripContacts`).

import { excerpt } from "@/lib/telegram/texts";
import type { Deadline, RequestTag } from "./types";

export interface PublicRequest {
  id: string;
  /** Текст запиту без контактів. */
  text: string;
  tags: RequestTag[];
  budget: number | null;
  deadline: Deadline | null;
  /** Своя дата «до» (`YYYY-MM-DD`); null — готовий строк. */
  deadlineDate: string | null;
  cityId: string | null;
  status: "open" | "closed";
  /** ISO-час публікації. */
  createdAt: string;
  /** Скільки виконавців уже відгукнулося. */
  responseCount: number;
  /** Дивиться автор: показуємо йому й запит, який інші не бачать. Id автора в об'єкті немає. */
  own: boolean;
  /** Запит доступний усім (автор дозволив показ); `false`: його бачить лише автор. */
  shared: boolean;
}

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 150;

/** Заголовок сторінки: початок тексту до першої крапки чи переносу, не довше 80 знаків. */
export const requestTitle = (text: string): string => {
  const first = text.trim().split(/(?<=[.!?])\s|\n/)[0] ?? "";
  return excerpt(first || text, TITLE_MAX);
};

/** Опис для `meta description` і Open Graph: перші 150 знаків тексту (контакти вже вирізані). */
export const requestDescription = (text: string): string =>
  excerpt(text, DESCRIPTION_MAX);
