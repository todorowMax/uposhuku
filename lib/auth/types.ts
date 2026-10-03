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
  /** Тестовий режим: листа немає. */
  mock: boolean;
  /** Скільки цифр у коді: 6 із листа, у тестовому режимі скільки в коді доступу. */
  codeLength: number;
  /** Підказка з самим кодом лише для локального 000000; закритий код доступу не показуємо. */
  hint?: string;
}
