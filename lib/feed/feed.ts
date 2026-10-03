// lib/feed/feed.ts
//
// Запити для стрічки виконавця й карти: усе з D1 (lib/server/request-repo).
// Підбір поки простий: скільки тегів запиту закриває профіль виконавця.

import { CITIES } from "@/lib/map/cities";
import { DEADLINES } from "@/lib/requests/types";
import { listOthersOpen, listRequests, myResponses, removeResponse, responseCounts, saveResponse } from "@/lib/server/request-repo";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { MATCH_THRESHOLD, tagSimilarity } from "@/lib/tags/match";
import { RESPONSE_LIMITS, type FeedItem, type MapRequest, type MyResponse } from "./types";

export { removeResponse, saveResponse };

const label = (id: string) => TAGS_BY_ID.get(id)?.label ?? id;
const cityName = (id: string | null) => (id ? (CITIES.find((city) => city.id === id)?.name ?? "Україна") : "Віддалено");

/** Скільки тегів запиту закриває профіль: той самий тег, батько чи дитина. */
const coverage = (requestTags: string[], profileTags: string[]) =>
  new Set(requestTags.filter((wanted) => profileTags.some((offered) => tagSimilarity(wanted, offered) >= MATCH_THRESHOLD)));

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

/** Усі відкриті запити, які бачить ця людина: чужі й свої. */
const collect = async (userId: string): Promise<Raw[]> => {
  const [othersList, mineList] = await Promise.all([listOthersOpen(userId), listRequests(userId)]);
  const counts = await responseCounts([...othersList, ...mineList].map((request) => request.id));
  const toRaw = (request: (typeof othersList)[number], own: boolean): Raw => ({
    id: request.id,
    text: request.text,
    tags: request.tags.map((tag) => tag.id),
    cityId: request.cityId ?? null,
    place: request.cityId ? cityName(request.cityId) : "Віддалено",
    budget: request.budget ? money(request.budget) : null,
    deadline: request.deadline ? DEADLINES[request.deadline] : null,
    createdAt: request.createdAt,
    responses: counts.get(request.id) ?? 0,
    own,
  });
  return [...othersList.map((request) => toRaw(request, false)), ...mineList.filter((request) => request.status === "open").map((request) => toRaw(request, true))];
};

const toItem = (userId: string | null, raw: Raw, profileTags: string[], mine: Map<string, MyResponse>): FeedItem => {
  const matched = coverage(raw.tags, profileTags);
  return {
    id: raw.id,
    text: raw.text,
    tags: raw.tags.map((id) => ({ id, label: label(id), matched: matched.has(id) })),
    place: raw.place,
    budget: raw.budget,
    deadline: raw.deadline,
    createdAt: raw.createdAt,
    responses: raw.responses,
    matchedTags: matched.size,
    response: userId ? (mine.get(raw.id) ?? null) : null,
  };
};

/**
 * Запити під теги профілю: спершу ті, що закривають більше тегів, потім
 * свіжіші. Без жодного збігу запит виконавцю не показуємо. Свої не бачимо.
 */
export const feedFor = async (userId: string, profileTags: string[]): Promise<FeedItem[]> => {
  const [raw, mine] = await Promise.all([collect(userId), myResponses(userId)]);
  return raw
    .filter((item) => !item.own)
    .map((item) => toItem(userId, item, profileTags, mine))
    .filter((item) => item.matchedTags > 0)
    .sort((a, b) => b.matchedTags - a.matchedTags || b.createdAt.localeCompare(a.createdAt));
};

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
export const mapRequests = async (userId: string | null, profileTags: string[]): Promise<MapRequest[]> => {
  const [raw, mine] = await Promise.all([collect(userId ?? "guest"), userId ? myResponses(userId) : Promise.resolve(new Map<string, MyResponse>())]);
  return raw.map((item) => ({ ...toItem(userId, item, profileTags, mine), point: pointOf(item), own: item.own })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** Чи є такий запит у стрічці цієї людини: відповісти можна лише на показане. */
export const feedHas = async (userId: string, requestId: string, profileTags: string[]) => (await feedFor(userId, profileTags)).some((item) => item.id === requestId);

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
