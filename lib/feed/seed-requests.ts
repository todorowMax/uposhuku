// lib/feed/seed-requests.ts
//
// Демо-запити, якими сід наповнює dev-базу (scripts/seed-dev.ts). У застосунку
// їх немає: стрічка й карта читають запити з D1. Лишаються тут і як фікстура
// для тестів розпізнавання тегів.

import type { DEADLINES } from "@/lib/requests/types";

/**
 * Теги заготовки мають збігатися з тим, що розпізнається з її тексту
 * (tests/unit/feed.test.ts): мок поводиться так, як справжній запит.
 */
interface Template {
  text: string;
  tags: string[];
  cityId: string | null;
  budget: string | null;
  deadline?: keyof typeof DEADLINES;
  /** Секунди від першого відкриття стрічки: від'ємні — уже були, додатні — прийдуть. */
  at: number;
  responses: number;
}

export const TEMPLATES: Template[] = [
  { text: "Потрібен Telegram-бот для запису клієнтів у барбершоп: вибір майстра, нагадування за день і оплата через Monobank.", tags: ["telegram-bot", "online-booking", "monobank", "notifications"], cityId: "lviv", budget: "до 15 000 ₴", deadline: "week", at: -1800, responses: 3 },
  { text: "Хочемо інтернет-магазин кераміки ручної роботи: каталог, кошик, доставка Новою Поштою й оплата карткою.", tags: ["online-store", "cart-checkout", "nova-poshta", "online-payments"], cityId: "kyiv", budget: "20 000–40 000 ₴", deadline: "month", at: -5400, responses: 5 },
  { text: "Потрібно оновити сайт стоматологічної клініки: застарілий дизайн, погано виглядає на телефоні, потрібен онлайн-запис.", tags: ["redesign", "website", "dentistry", "online-booking"], cityId: "kharkiv", budget: null, at: -9000, responses: 2 },
  { text: "Шукаю розробника мобільного застосунку-планера для власників домашніх улюбленців: щеплення, візити до ветеринара, нагадування.", tags: ["mobile-app", "planner-app", "veterinary", "notifications"], cityId: null, budget: "від 50 000 ₴", at: 25, responses: 1 },
  { text: "Треба 3 рекламні банери для автомийки, під сайт і Instagram. Макети в різних розмірах.", tags: ["graphic-design", "auto", "website", "instagram"], cityId: "odesa", budget: "до 5 000 ₴", deadline: "asap", at: 70, responses: 0 },
  { text: "Налаштувати CRM для салону краси: заявки з Instagram і сайту в одну воронку, нагадування майстрам, звіти.", tags: ["crm", "beauty", "instagram"], cityId: "dnipro", budget: "10 000–25 000 ₴", at: 120, responses: 2 },
  { text: "Автоматизувати заявки: з форми на сайті в Google Sheets і повідомлення менеджеру в Telegram.", tags: ["automation", "google-sheets", "telegram-api"], cityId: null, budget: "до 8 000 ₴", deadline: "two_weeks", at: 180, responses: 4 },
  { text: "Лендинг для онлайн-курсу англійської: структура, дизайн, форма заявки й оплата.", tags: ["landing", "forms", "online-payments"], cityId: "ternopil", budget: "12 000 ₴", deadline: "flexible", at: 240, responses: 1 },
  { text: "Потрібен парсер цін конкурентів з кількох магазинів, щоденний звіт у таблицю.", tags: ["parser", "price-monitoring", "google-sheets"], cityId: null, budget: "6 000–12 000 ₴", at: 310, responses: 0 },
  { text: "Логотип і фірмовий стиль для невеликої пекарні: візитки, упаковка, вивіска.", tags: ["branding", "food-production"], cityId: "poltava", budget: "до 18 000 ₴", at: 400, responses: 3 },
];

