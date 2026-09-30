// lib/auth/types.ts
//
// Контракт входу, спільний для сервера й клієнта. Коли з'являться D1 і
// Resend, змінюється реалізація в lib/auth/*, а не ці типи.

export interface SessionUser {
  id: string;
  email: string;
  /** Ім'я з Google або те, що людина вкаже в профілі. */
  name: string | null;
  via: "email" | "google";
}

/** Відповідь POST /api/auth/email/start. */
export interface EmailStartResult {
  sent: true;
  /** Тестовий режим: листа немає, код — MOCK_CODE. Інтерфейс показує підказку. */
  mock: boolean;
}
