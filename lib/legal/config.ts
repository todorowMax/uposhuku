// lib/legal/config.ts
//
// Єдине місце з реквізитами й цифрами, які повторюються в оферті, умовах і
// політиці. Банк (Monobank) перед еквайрингом звіряє ім'я й код з договором
// ФОП, тож тут вони мають збігатися з документами, а в тексті сторінок їх
// не дублюємо: підставляємо через {плейсхолдери}.

import { HOLD_DAYS, MAX_STAGES, SAFE_FEE } from "@/lib/deals/types";
import { MAX_PAYMENT, MIN_PAYMENT } from "@/lib/placement/pricing";

export const SERVICE_NAME = "Vibe Map";

/** Той самий ФОП, що й в Укошику. Якщо проєкт піде на іншу особу, міняємо лише тут. */
export const OPERATOR = {
  entity: "ФОП Тодоров Максим Олександрович",
  fullName: "Тодоров Максим Олександрович",
  taxId: "3593211091",
  address: "Україна, Київська обл., Броварський р-н, с. Погреби, вул. Молодіжна, буд. 6А",
} as const;

/**
 * Пошта для звернень. Назва проєкту ще може змінитися; коли оберемо кінцевий
 * домен і підключимо пошту в Resend, міняємо тут (і більше ніде).
 */
export const CONTACT_EMAIL = "hello@uposhuku.com";

/**
 * Безпечну угоду (холд і виплата виконавцю через Monobank) не вмикаємо до
 * письмових відповідей банку. Поки прапорець вимкнено, оферта й умови про неї
 * мовчать: не можна обіцяти людям те, чого на сайті немає.
 */
export const SAFE_DEAL_ENABLED = false;

/** Дати останньої правки кожного документа. */
export const UPDATED = {
  offer: "3 жовтня 2026 року",
  terms: "3 жовтня 2026 року",
  privacy: "3 жовтня 2026 року",
  contacts: "3 жовтня 2026 року",
} as const;

const money = (value: number) => new Intl.NumberFormat("uk-UA").format(value).replace(/ /g, " ");

/** Значення для {плейсхолдерів} у текстах. */
export const LEGAL_VALUES: Record<string, string> = {
  service: SERVICE_NAME,
  entity: OPERATOR.entity,
  taxId: OPERATOR.taxId,
  address: OPERATOR.address,
  email: CONTACT_EMAIL,
  minPayment: money(MIN_PAYMENT),
  maxPayment: money(MAX_PAYMENT),
  holdDays: String(HOLD_DAYS),
  maxStages: String(MAX_STAGES),
  fee: String(Math.round(SAFE_FEE * 100)),
};

/** Підставляє значення в текст. Невідомий плейсхолдер лишається видно, щоб тест його впіймав. */
export const fill = (text: string): string => text.replace(/\{(\w+)\}/g, (match, key: string) => LEGAL_VALUES[key] ?? match);
