// lib/feed/mock-feed.ts
//
// Запити для стрічки виконавця. Поки на платформі немає інших замовників,
// частина запитів — заготовки, які «приходять» по одному з моменту, коли
// виконавець уперше відкрив стрічку: так видно живу стрічку й «+N нових».
// Запити інших акаунтів (якщо є) додаються до заготовок. Справжня версія:
// запити з D1 + підбір /api/matches, відгуки в таблиці responses.

import { CITIES } from "@/lib/map/cities";
import { listOthersOpen, listRequests } from "@/lib/requests/mock-store";
import { DEADLINES } from "@/lib/requests/types";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { MATCH_THRESHOLD, tagSimilarity } from "@/lib/tags/match";
import { RESPONSE_LIMITS, type FeedItem, type MapRequest, type MyResponse } from "./types";

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
interface Raw {
  id: string;
  text: string;
  tags: string[];
  cityId: string | null;
  place: string;
  budget: string | null;
  deadline: string | null;
  createdAt: string;
  responses: number;
  own: boolean;
}

const money = (value: number) => `до ${new Intl.NumberFormat("uk-UA").format(value)} ₴`;

/** Усі відкриті запити, які бачить ця людина: заготовки, що вже «прийшли», чужі й свої. */
const collect = (userId: string, now: number): Raw[] => {
  const first = starts().get(userId) ?? now;
  starts().set(userId, first);

  const demo: Raw[] = TEMPLATES.map((template, index) => ({ template, index }))
    .filter(({ template }) => first + template.at * 1000 <= now)
    .map(({ template, index }) => ({
      id: `demo-${index}`,
      text: template.text,
      tags: template.tags,
      cityId: template.cityId,
      place: cityName(template.cityId),
      budget: template.budget,
      deadline: template.deadline ? DEADLINES[template.deadline] : null,
      createdAt: new Date(first + template.at * 1000).toISOString(),
      responses: template.responses,
      own: false,
    }));
  const toRaw = (request: ReturnType<typeof listOthersOpen>[number], own: boolean): Raw => ({
    id: request.id,
    text: request.text,
    tags: request.tags.map((tag) => tag.id),
    cityId: request.cityId ?? null,
    place: request.cityId ? cityName(request.cityId) : "Віддалено",
    budget: request.budget ? money(request.budget) : null,
    deadline: request.deadline ? DEADLINES[request.deadline] : null,
    createdAt: request.createdAt,
    responses: 0,
    own,
  });
  const others = listOthersOpen(userId).map((request) => toRaw(request, false));
  const mine = listRequests(userId).filter((request) => request.status === "open").map((request) => toRaw(request, true));
  return [...demo, ...others, ...mine];
};

const toItem = (userId: string | null, raw: Raw, profileTags: string[]): FeedItem => {
  const matched = coverage(raw.tags, profileTags);
  const mine = userId ? (responses().get(key(userId, raw.id)) ?? null) : null;
  return {
    id: raw.id,
    text: raw.text,
    tags: raw.tags.map((id) => ({ id, label: label(id), matched: matched.has(id) })),
    place: raw.place,
    budget: raw.budget,
    deadline: raw.deadline,
    createdAt: raw.createdAt,
    responses: raw.responses + (mine ? 1 : 0),
    matchedTags: matched.size,
    response: mine,
  };
};

/**
 * Запити під теги профілю: спершу ті, що закривають більше тегів, потім
 * свіжіші. Без жодного збігу запит виконавцю не показуємо. Свої не бачимо.
 */
export const feedFor = (userId: string, profileTags: string[], now = Date.now()): FeedItem[] =>
  collect(userId, now)
    .filter((raw) => !raw.own)
    .map((raw) => toItem(userId, raw, profileTags))
    .filter((item) => item.matchedTags > 0)
    .sort((a, b) => b.matchedTags - a.matchedTags || b.createdAt.localeCompare(a.createdAt));

/** Точка запиту: у межах міста з невеликим стабільним зсувом, щоб запити одного міста не злипались. */
const pointOf = (raw: Raw): MapRequest["point"] => {
  const city = CITIES.find((item) => item.id === raw.cityId);
  if (!city) return null;
  let hash = 2166136261;
  for (let index = 0; index < raw.id.length; index++) {
    hash ^= raw.id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
  const radius = 0.03 + (((hash >>> 9) >>> 0) % 50) / 1000;
  return { lat: city.lat + Math.sin(angle) * radius, lng: city.lng + (Math.cos(angle) * radius) / 0.65 };
};

/**
 * Запити на карті: бачить кожен, навіть гість, але лише місто (точка
 * зсунута), без особистих даних. Виконавцю додатково видно, що з тегів
 * збігається і чи він уже відгукнувся. Свій запит позначено own.
 */
export const mapRequests = (userId: string | null, profileTags: string[], now = Date.now()): MapRequest[] =>
  collect(userId ?? "guest", now)
    .map((raw) => ({ ...toItem(userId, raw, profileTags), point: pointOf(raw), own: raw.own }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
