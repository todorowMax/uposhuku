// lib/tags/catalog.ts
//
// Адреси й заголовки сторінок каталогу `/poslugy/<слаг>[/<місто>]`. Словник тегів (dictionary.ts) цього не знає, тому тут
// лише дописки до нього: слаг (типово сам id тегу: латиниця й дефіси) і заголовок, з якого складається «Розробка лендингів
// у Львові». Тег без свого заголовка показується за назвою зі словника. Підбір і синоніми цей файл не чіпає.

import { TAGS, TAGS_BY_ID } from "./dictionary";

/** Слаг, відмінний від id тегу: коли id вузький для адреси, яку шукають люди. Усе інше береться з id. */
const SLUGS: Record<string, string> = {
  website: "rozrobka-saitiv",
  landing: "lendynhy",
  "online-store": "internet-mahazyny",
  "mobile-app": "mobilni-zastosunky",
  "telegram-bot": "telegram-boty",
  "chat-bot": "chat-boty",
  crm: "crm-systemy",
  "ui-ux-design": "ui-ux-dyzain",
  branding: "lohotypy-ta-brendynh",
  "graphic-design": "hrafichnyi-dyzain",
  "code-review": "revyu-kodu",
  "ai-code-fix": "dorobka-kodu-pislia-shi",
};

/** Заголовок послуги в називному відмінку множини чи як назва послуги; до нього дописується «у <місті>». */
const HEADINGS: Record<string, string> = {
  website: "Розробка сайтів",
  landing: "Розробка лендингів",
  "business-card-site": "Розробка сайтів-візиток",
  "corporate-site": "Розробка корпоративних сайтів",
  "portfolio-site": "Розробка сайтів-портфоліо",
  "online-store": "Розробка інтернет-магазинів",
  marketplace: "Розробка маркетплейсів",
  lms: "Розробка навчальних платформ",
  app: "Розробка застосунків",
  "web-app": "Розробка веб-застосунків",
  saas: "Розробка SaaS-сервісів",
  mvp: "Розробка MVP",
  "mobile-app": "Розробка мобільних застосунків",
  "ios-app": "Розробка iOS-застосунків",
  "android-app": "Розробка Android-застосунків",
  "chat-bot": "Розробка чат-ботів",
  "telegram-bot": "Розробка Telegram-ботів",
  "telegram-mini-app": "Розробка Telegram Mini App",
  "viber-bot": "Розробка Viber-ботів",
  "whatsapp-bot": "Розробка WhatsApp-ботів",
  "ai-assistant": "Розробка ШІ-асистентів",
  "ai-agent": "Розробка ШІ-агентів",
  crm: "Розробка CRM-систем",
  erp: "Розробка ERP-систем",
  "admin-panel": "Розробка адмін-панелей",
  dashboard: "Розробка дашбордів",
  "api-backend": "Розробка API та бекенду",
  automation: "Автоматизація процесів",
  parser: "Розробка парсерів",
  "integration-service": "Інтеграції між сервісами",
  game: "Розробка ігор",
  "browser-extension": "Розробка розширень для браузера",
  "restaurant-website": "Розробка сайтів для ресторанів і кафе",
  "real-estate-website": "Розробка сайтів для агентств нерухомості",
  "ui-ux-design": "UI/UX-дизайн",
  branding: "Логотипи та брендинг",
  "graphic-design": "Графічний дизайн",
  redesign: "Редизайн сайтів і застосунків",
  "code-review": "Ревʼю коду",
  "security-audit": "Аудит безпеки",
  "ai-code-fix": "Доробка коду після ШІ",
  "bug-fixing": "Виправлення помилок у коді",
  refactoring: "Рефакторинг коду",
  testing: "Тестування та QA",
  performance: "Оптимізація швидкості сайтів",
  devops: "Деплой і DevOps",
  migration: "Перенесення та міграція сайтів",
  support: "Підтримка й супровід сайтів",
  seo: "SEO-просування",
  ads: "Налаштування реклами",
  smm: "SMM-послуги",
  copywriting: "Копірайтинг",
  "video-editing": "Відеомонтаж",
  consulting: "Консультації з розробки",
  "spec-writing": "Технічні завдання",
  "ai-integration": "Впровадження ШІ в бізнес",
  "crm-setup": "Налаштування CRM",
  "analytics-setup": "Налаштування аналітики",
  "app-store-publishing": "Публікація в App Store та Google Play",
  localization: "Локалізація й переклад",
  wordpress: "Розробка сайтів на WordPress",
  tilda: "Розробка сайтів на Tilda",
  shopify: "Розробка магазинів на Shopify",
  woocommerce: "Розробка магазинів на WooCommerce",
  nextjs: "Розробка на Next.js",
  react: "Розробка на React",
  python: "Розробка на Python",
  flutter: "Розробка на Flutter",
  n8n: "Автоматизація на n8n",
};

export const tagSlug = (id: string): string => SLUGS[id] ?? id;

/** Заголовок послуги без міста: свій, а коли його не написано, назва тегу. `null`, якщо такого тегу немає. */
export const tagHeading = (id: string): string | null => HEADINGS[id] ?? TAGS_BY_ID.get(id)?.label ?? null;

const BY_SLUG = new Map(TAGS.map((tag) => [tagSlug(tag.id), tag.id]));

/** Id тегу за слагом з адреси; `null`, якщо слаг невідомий. Id тегу, чий слаг інший, адресою не вважається. */
export const tagIdBySlug = (slug: string): string | null => BY_SLUG.get(slug) ?? null;

/** Усі слаги: для перевірки унікальності. */
export const allTagSlugs = (): string[] => TAGS.map((tag) => tagSlug(tag.id));
