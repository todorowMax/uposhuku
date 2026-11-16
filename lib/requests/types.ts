// lib/requests/types.ts
//
// Контракт запиту замовника, спільний для сервера й клієнта.

export interface RequestTag {
  id: string;
  /** Назву кладемо поруч, щоб «Мої запити» не вантажили словник тегів. */
  label: string;
}

/** Посилання на вже завантажений файл: у чернетці йдуть лише id, ім'я, розмір і тип сервер бере зі свого рядка. */
export interface RequestFileRef {
  id: number;
}

/**
 * Файл запиту, як його бачать автор і виконавець. Байти лежать у R2 і віддаються через `/api/request-files/<id>`
 * лише тим, хто має доступ до запиту (`lib/server/request-files.ts`).
 */
export interface RequestFile extends RequestFileRef {
  name: string;
  size: number;
  /** Тип, який визначив сервер за вмістом (не клієнтський). */
  type: string;
  /** false — старий запис без файла (від часів, коли зберігався лише опис): лише назва, відкрити нічого. */
  stored: boolean;
}

/** Адреса, за якою авторизована людина з доступом до запиту відкриває файл. */
export const requestFileUrl = (id: number) => `/api/request-files/${id}`;

/** Коли потрібен результат. Пресети, а не дата: так швидше обрати, і виконавець бачить масштаб. */
export const DEADLINES = {
  asap: "Терміново, до 3 днів",
  week: "Протягом тижня",
  two_weeks: "За 2 тижні",
  month: "За місяць",
  flexible: "Не горить",
} as const;
export type Deadline = keyof typeof DEADLINES;
export const isDeadline = (value: unknown): value is Deadline => typeof value === "string" && value in DEADLINES;

/** Що людина відправляє: текст, теги, файли й необов'язкові умови з поля запиту. */
export interface RequestDraft {
  text: string;
  tags: RequestTag[];
  files: RequestFileRef[];
  /** Бюджет «до N ₴»; null — не вказано або «за домовленістю». */
  budget?: number | null;
  deadline?: Deadline | null;
  /**
   * Своя дата «до» (`YYYY-MM-DD`, день за Києвом); null — обрано готовий строк. Коли дата є, `deadline` це знімок,
   * виведений з неї при збереженні (`lib/requests/deadline-date.ts`), і з часом не міняється.
   */
  deadlineDate?: string | null;
  /** Місто замовника; null — «Віддалено» або не вказано. */
  cityId?: string | null;
  /** Можна показати запит у публічному Telegram-каналі (без контактів). Типово так. */
  channelOptIn?: boolean;
}

export interface PublishedRequest extends RequestDraft {
  id: string;
  files: RequestFile[];
  status: "open" | "closed";
  /** ISO-час публікації. */
  createdAt: string;
  /** ISO-час останньої правки автором; null, якщо запит не змінювали. */
  editedAt: string | null;
  /** До якого часу (ISO) закритий запит можна відновити; null, якщо запит відкритий, доба минула або закрито до появи `closed_at`. */
  restoreUntil: string | null;
  /** Чому запит закрито: `expired` — автор не відповів на «Ще актуально?»; null — закрив сам або запит відкритий. */
  closeReason: "expired" | null;
  /** До якого часу (ISO) автор може відповісти на «Ще актуально?», інакше запит закриється; null, якщо питання не ставили. */
  renewalDeadline: string | null;
}

/** Скільки після першого закриття автор може відновити запит (для «протермінованого» інакше, див. `lib/requests/lifetime.ts`). Спільна для сервера й клієнта. */
export const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  /** Власне фото виконавця (data URL); без нього — обличчя з атласу за avatarIndex. */
  photo?: string;
  /** Ціна в гривнях; null — «після обговорення». */
  price: number | null;
  /** За скільки днів готовий зробити. */
  days: number;
  message: string;
  createdAt: string;
  /** Рішення замовника: нове, у обраних, відхилено, обрано. Бачить лише він. */
  status: ResponseStatus;
}

export const RESPONSE_STATUSES = ["new", "shortlisted", "declined", "chosen"] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];
export const isResponseStatus = (value: unknown): value is ResponseStatus => typeof value === "string" && (RESPONSE_STATUSES as readonly string[]).includes(value);
