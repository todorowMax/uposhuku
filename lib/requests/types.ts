// lib/requests/types.ts
//
// Контракт запиту замовника, спільний для сервера й клієнта.

export interface RequestTag {
  id: string;
  /** Назву кладемо поруч, щоб «Мої запити» не вантажили словник тегів. */
  label: string;
}

/** Файл, прикріплений до запиту. Поки лише опис: R2 ще немає. */
export interface RequestFile {
  name: string;
  size: number;
  type: string;
}

/** Що людина відправляє: текст, теги й файли з поля запиту. */
export interface RequestDraft {
  text: string;
  tags: RequestTag[];
  files: RequestFile[];
}

export interface PublishedRequest extends RequestDraft {
  id: string;
  status: "open" | "closed";
  /** ISO-час публікації. */
  createdAt: string;
}

export const REQUEST_TEXT_MIN = 3;
export const REQUEST_TEXT_MAX = 4000;

/**
 * Відгук виконавця на запит: ціна й термін, як домовились у плані
 * («відгук з ціною»). Дані виконавця — копією, щоб панель не ходила по профілі.
 */
export interface OfferResponse {
  id: string;
  requestId: string;
  performerId: string;
  name: string;
  specialty: string;
  cityName: string;
  avatarIndex: number;
  /** Рівень оплаченого розміщення 1–6: за ним порядок у списку. */
  tier: number;
  /** Позначка «Просування» (закон «Про рекламу»): платне місце вище в списку. */
  promoted: boolean;
  rating: string;
  /** Ціна в гривнях; null — «після обговорення». */
  price: number | null;
  /** За скільки днів готовий зробити. */
  days: number;
  message: string;
  createdAt: string;
}
