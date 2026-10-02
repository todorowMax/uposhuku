// lib/feed/mock-feed.ts
//
// Запити для стрічки виконавця. Поки на платформі немає інших замовників,
// частина запитів — заготовки, які «приходять» по одному з моменту, коли
// виконавець уперше відкрив стрічку: так видно живу стрічку й «+N нових».
// Запити інших акаунтів (якщо є) додаються до заготовок. Справжня версія:
// запити з D1 + підбір /api/matches, відгуки в таблиці responses.

import { CITIES } from "@/lib/map/cities";
import { listOthersOpen } from "@/lib/requests/mock-store";
import { DEADLINES } from "@/lib/requests/types";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { MATCH_THRESHOLD, tagSimilarity } from "@/lib/tags/match";
import { RESPONSE_LIMITS, type FeedItem, type MyResponse } from "./types";

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

const TEMPLATES: Template[] = [
  { text: "Потрібен Telegram-бот для запису клієнтів у барбершоп: вибір майстра, нагадування за день і оплата через Monobank.", tags: ["telegram-bot", "online-booking", "monobank", "notifications"], cityId: "lviv", budget: "до 15 000 ₴", deadline: "week", at: -1800, responses: 3 },
  { text: "Хочемо інтернет-магазин кераміки ручної роботи: каталог, кошик, доставка Новою Поштою й оплата карткою.", tags: ["online-store", "catalog", "nova-poshta", "online-payments"], cityId: "kyiv", budget: "20 000–40 000 ₴", deadline: "month", at: -5400, responses: 5 },
  { text: "Потрібно оновити сайт стоматологічної клініки: застарілий дизайн, погано виглядає на телефоні, потрібен онлайн-запис.", tags: ["redesign", "website", "dentistry", "online-booking"], cityId: "kharkiv", budget: null, at: -9000, responses: 2 },
  { text: "Шукаю розробника мобільного застосунку-планера для власників домашніх улюбленців: щеплення, візити до ветеринара, нагадування.", tags: ["mobile-app", "planner-app", "veterinary", "notifications"], cityId: null, budget: "від 50 000 ₴", at: 25, responses: 1 },
  { text: "Треба 3 рекламні банери для автомийки, під сайт і Instagram. Макети в різних розмірах.", tags: ["graphic-design", "auto", "smm"], cityId: "odesa", budget: "до 5 000 ₴", deadline: "asap", at: 70, responses: 0 },
  { text: "Налаштувати CRM для салону краси: заявки з Instagram і сайту в одну воронку, нагадування майстрам, звіти.", tags: ["crm", "beauty", "automation"], cityId: "dnipro", budget: "10 000–25 000 ₴", at: 120, responses: 2 },
  { text: "Автоматизувати заявки: з форми на сайті в Google Sheets і повідомлення менеджеру в Telegram.", tags: ["automation", "google-sheets", "telegram-bot"], cityId: null, budget: "до 8 000 ₴", deadline: "two_weeks", at: 180, responses: 4 },
  { text: "Лендинг для онлайн-курсу англійської: структура, дизайн, форма заявки й оплата.", tags: ["landing", "education", "online-payments"], cityId: "ternopil", budget: "12 000 ₴", deadline: "flexible", at: 240, responses: 1 },
  { text: "Потрібен парсер цін конкурентів з кількох магазинів, щоденний звіт у таблицю.", tags: ["parser", "price-monitoring", "google-sheets"], cityId: null, budget: "6 000–12 000 ₴", at: 310, responses: 0 },
  { text: "Логотип і фірмовий стиль для невеликої пекарні: візитки, упаковка, вивіска.", tags: ["branding", "graphic-design", "food-production"], cityId: "poltava", budget: "до 18 000 ₴", at: 400, responses: 3 },
];

const g = globalThis as typeof globalThis & {
  __vmFeedStart?: Map<string, number>;
  __vmFeedResponses?: Map<string, MyResponse>;
};
const starts = () => (g.__vmFeedStart ??= new Map());
const responses = () => (g.__vmFeedResponses ??= new Map());
const key = (userId: string, requestId: string) => `${userId}|${requestId}`;

const label = (id: string) => TAGS_BY_ID.get(id)?.label ?? id;
const cityName = (id: string | null) => (id ? (CITIES.find((city) => city.id === id)?.name ?? "Україна") : "Віддалено");

/** Скільки тегів запиту закриває профіль: той самий тег, батько чи дитина. */
const coverage = (requestTags: string[], profileTags: string[]) => {
  const matched = new Set(
    requestTags.filter((wanted) => profileTags.some((offered) => tagSimilarity(wanted, offered) >= MATCH_THRESHOLD))
  );
  return matched;
};

/**
 * Запити під теги профілю: спершу ті, що закривають більше тегів, потім
 * свіжіші. Без жодного збігу запит виконавцю не показуємо.
 */
export const feedFor = (userId: string, profileTags: string[], now = Date.now()): FeedItem[] => {
  const first = starts().get(userId) ?? now;
  starts().set(userId, first);

  const demo = TEMPLATES.filter((template) => first + template.at * 1000 <= now).map((template, index) => ({
    id: `demo-${TEMPLATES.indexOf(template)}`,
    text: template.text,
    tags: template.tags,
    place: cityName(template.cityId),
    budget: template.budget,
    deadline: template.deadline ? DEADLINES[template.deadline] : null,
    createdAt: new Date(first + template.at * 1000).toISOString(),
    responses: template.responses,
    order: index,
  }));
  const others = listOthersOpen(userId).map((request) => ({
    id: request.id,
    text: request.text,
    tags: request.tags.map((tag) => tag.id),
    place: request.cityId ? cityName(request.cityId) : "Віддалено",
    budget: request.budget ? `до ${new Intl.NumberFormat("uk-UA").format(request.budget)} ₴` : null,
    deadline: request.deadline ? DEADLINES[request.deadline] : null,
    createdAt: request.createdAt,
    responses: 0,
    order: 0,
  }));

  return [...demo, ...others]
    .map((request) => {
      const matched = coverage(request.tags, profileTags);
      const mine = responses().get(key(userId, request.id)) ?? null;
      return {
        id: request.id,
        text: request.text,
        tags: request.tags.map((id) => ({ id, label: label(id), matched: matched.has(id) })),
        place: request.place,
        budget: request.budget,
        deadline: request.deadline,
        createdAt: request.createdAt,
        responses: request.responses + (mine ? 1 : 0),
        matchedTags: matched.size,
        response: mine,
      } satisfies FeedItem;
    })
    .filter((item) => item.matchedTags > 0)
    .sort((a, b) => b.matchedTags - a.matchedTags || b.createdAt.localeCompare(a.createdAt));
};

/** Чи є такий запит у стрічці цієї людини: відповісти можна лише на показане. */
export const feedHas = (userId: string, requestId: string, profileTags: string[]) =>
  feedFor(userId, profileTags).some((item) => item.id === requestId);

export const saveResponse = (userId: string, requestId: string, value: Omit<MyResponse, "createdAt">): MyResponse => {
  const saved = { ...value, createdAt: new Date().toISOString() };
  responses().set(key(userId, requestId), saved);
  return saved;
};

export const removeResponse = (userId: string, requestId: string) => responses().delete(key(userId, requestId));

/** Тіло відгуку від клієнта: ціна, термін, повідомлення в розумних межах. */
export const parseResponse = (body: Record<string, unknown> | null): Omit<MyResponse, "createdAt"> | string => {
  if (!body) return "Порожній запит.";
  const rawPrice = body.price;
  let price: number | null = null;
  if (rawPrice !== null && rawPrice !== undefined) {
    if (typeof rawPrice !== "number" || !Number.isFinite(rawPrice) || rawPrice < 1 || rawPrice > RESPONSE_LIMITS.maxPrice) return "Вкажіть ціну в гривнях або оберіть «після обговорення».";
    price = Math.round(rawPrice);
  }
  const days = typeof body.days === "number" ? Math.round(body.days) : NaN;
  if (!Number.isFinite(days) || days < RESPONSE_LIMITS.minDays || days > RESPONSE_LIMITS.maxDays) return "Вкажіть, за скільки днів зробите.";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, RESPONSE_LIMITS.message) : "";
  if (message.length < 10) return "Напишіть кілька слів замовнику: що зробите й коли почнете.";
  return { price, days, message };
};

/** Справжні відгуки виконавців на запит: хто відповів і що. Для пропозицій замовника. */
export const responsesTo = (requestId: string): { userId: string; response: MyResponse }[] => {
  const suffix = `|${requestId}`;
  return [...responses().entries()]
    .filter(([entryKey]) => entryKey.endsWith(suffix))
    .map(([entryKey, response]) => ({ userId: entryKey.slice(0, -suffix.length), response }));
};
