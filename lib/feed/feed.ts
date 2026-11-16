// lib/feed/feed.ts
//
// Запити для стрічки виконавця й карти: усе з D1 (lib/server/request-repo).
// Підбір: скільки тегів запиту закриває профіль виконавця, потім збіг міста.

import { CITIES } from "@/lib/map/cities";
import { DEADLINES, type PublishedRequest } from "@/lib/requests/types";
import { listOpenByIds, listOpenOwn, listOthersOpen, listOthersOpenSummaries, myResponses, removeResponse, requestOwner, responseCounts, saveResponse } from "@/lib/server/request-repo";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { MATCH_THRESHOLD, tagSimilarity } from "@/lib/tags/match";
import { requestPoint } from "./request-point";
import { FEED_PAGE, compareRank, pageAfter, parseCursor } from "./rank";
import { RESPONSE_LIMITS, type FeedItem, type FeedPage, type MapRequest, type MyResponse } from "./types";

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
  deadlineDate: string | null;
  createdAt: string;
  editedAt: string | null;
  responses: number;
  own: boolean;
}

/** Хто дивиться: теги й місто профілю виконавця. Гість і замовник без профілю: порожні. */
export interface Viewer {
  tags: string[];
  cityId: string | null;
}

const money = (value: number) => `до ${new Intl.NumberFormat("uk-UA").format(value)} ₴`;

const toRaw = (request: PublishedRequest, responses: number, own: boolean): Raw => ({
  id: request.id,
  text: request.text,
  tags: request.tags.map((tag) => tag.id),
  cityId: request.cityId ?? null,
  place: request.cityId ? cityName(request.cityId) : "Віддалено",
  budget: request.budget ? money(request.budget) : null,
  deadline: request.deadline ? DEADLINES[request.deadline] : null,
  deadlineDate: request.deadlineDate ?? null,
  createdAt: request.createdAt,
  editedAt: request.editedAt,
  responses,
  own,
});

/**
 * Запити для карти: найновіші чужі відкриті (стеля `MAP_REQUESTS_LIMIT`) і лише відкриті свої.
 * Усю історію власних запитів не читаємо.
 */
const collect = async (userId: string): Promise<Raw[]> => {
  const [othersList, ownList] = await Promise.all([listOthersOpen(userId), listOpenOwn(userId)]);
  const counts = await responseCounts([...othersList, ...ownList].map((request) => request.id));
  return [...othersList.map((request) => toRaw(request, counts.get(request.id) ?? 0, false)), ...ownList.map((request) => toRaw(request, counts.get(request.id) ?? 0, true))];
};

/** Місто профілю збігається з містом запиту. Без міста в профілі чи в запиті збігу немає. */
export const isSameCity = (profileCityId: string | null, requestCityId: string | null) => Boolean(profileCityId) && profileCityId === requestCityId;

const toItem = (raw: Raw, viewer: Viewer, mine: Map<string, MyResponse> | null): FeedItem => {
  const matched = coverage(raw.tags, viewer.tags);
  return {
    id: raw.id,
    text: raw.text,
    tags: raw.tags.map((id) => ({ id, label: label(id), matched: matched.has(id) })),
    place: raw.place,
    remote: !raw.cityId,
    sameCity: isSameCity(viewer.cityId, raw.cityId),
    budget: raw.budget,
    deadline: raw.deadline,
    deadlineDate: raw.deadlineDate,
    createdAt: raw.createdAt,
    editedAt: raw.editedAt,
    responses: raw.responses,
    matchedTags: matched.size,
    response: mine?.get(raw.id) ?? null,
  };
};

/**
 * Сторінка стрічки: усі чужі відкриті запити без стелі, найкращі першими: більше закритих
 * тегів профілю, потім запити з міста виконавця, потім свіжіші (`lib/feed/rank.ts`). Ранг
 * рахуємо по легких зведеннях, повні дані вантажимо лише для однієї сторінки. Збігу не
 * вимагаємо, як і на карті. Свої запити не бачимо й не читаємо.
 */
export const feedPage = async (userId: string, options: { viewer: Viewer; cursor?: string | null; size?: number }): Promise<FeedPage> => {
  const { viewer, cursor = null, size = FEED_PAGE } = options;
  const summaries = await listOthersOpenSummaries(userId);
  const ranked = summaries
    .map((summary) => ({ id: summary.id, createdAt: summary.createdAt, matched: coverage(summary.tags, viewer.tags).size, city: isSameCity(viewer.cityId, summary.cityId) }))
    .sort(compareRank);
  const page = pageAfter(ranked, parseCursor(cursor), size);
  const [requestsOnPage, mine] = await Promise.all([listOpenByIds(page.items.map((item) => item.id)), myResponses(userId)]);
  const counts = await responseCounts(requestsOnPage.map((request) => request.id));
  const items = requestsOnPage.map((request) => toItem(toRaw(request, counts.get(request.id) ?? 0, false), viewer, mine));
  return { items, next: page.next, total: ranked.length };
};

/**
 * Запити на карті: лише авторизований виконавець (маршрут віддає 401 і 403 решті), але
 * лише місто (точка зсунута), без особистих даних. Додатково видно, що з тегів збігається
 * і чи він уже відгукнувся. Свій запит позначено own. Без `userId` (тести) усе порожнє.
 */
export const mapRequests = async (userId: string | null, viewer: Viewer): Promise<MapRequest[]> => {
  const [raw, mine] = await Promise.all([collect(userId ?? "guest"), userId ? myResponses(userId) : Promise.resolve(null)]);
  return raw.map((item) => ({ ...toItem(item, viewer, mine), point: requestPoint(item.id, item.cityId), own: item.own })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/**
 * Чи може ця людина відгукнутися: запит існує, відкритий і не її власний. Збіг тегів не
 * вимагаємо: карта показує виконавцю й запити без збігу («Збіг: 0 з 5»), і відповісти
 * на них теж можна, це його рішення.
 */
export const canRespond = async (userId: string, requestId: string) => {
  const owner = await requestOwner(requestId);
  return Boolean(owner && owner.status === "open" && owner.userId !== userId);
};

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
