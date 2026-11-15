// lib/seo/catalog.ts
//
// Чиста логіка сторінок каталогу `/poslugy/<тег>[/<місто>]`: адреса, заголовок, медіана, правило індексації, сусідні міста
// й споріднені теги. Дані бере lib/server/catalog-repo.ts, розмітку малює components/catalog-page.

import { CITIES, cityById, cityLocative } from "@/lib/map/cities";
import { TAGS, TAGS_BY_ID } from "@/lib/tags/dictionary";
import { tagHeading, tagIdBySlug, tagSlug } from "@/lib/tags/catalog";

/** Сторінка йде в індекс лише з такою кількістю виконавців: менше це тонка сторінка, її не показуємо пошуку. */
export const MIN_INDEXABLE_PERFORMERS = 3;

export const catalogIndexable = (performerCount: number): boolean => performerCount >= MIN_INDEXABLE_PERFORMERS;

/** Медіана бюджетів, у гривнях; `null`, коли бюджетів немає. Нулі й від'ємні значення не рахуються. */
export const medianBudget = (budgets: (number | null)[]): number | null => {
  const values = budgets.filter((value): value is number => typeof value === "number" && value > 0).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
};

/** Адреса сторінки без домену. */
export const catalogPath = (tagId: string, cityId: string | null = null): string =>
  `/poslugy/${tagSlug(tagId)}${cityId ? `/${cityId}` : ""}`;

/** `h1`: «Розробка лендингів у Львові», без міста просто назва послуги. */
export const catalogHeading = (tagId: string, cityId: string | null = null): string => {
  const heading = tagHeading(tagId) ?? tagId;
  return cityId ? `${heading} ${cityLocative(cityId)}` : heading;
};

const KM_PER_DEGREE = 111;

const distance = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = (a.lat - b.lat) * KM_PER_DEGREE;
  const dLng = (a.lng - b.lng) * KM_PER_DEGREE * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
};

/** Найближчі до `cityId` міста з переліку `candidates` (без нього самого), від найближчого. */
export const nearestCities = (cityId: string, candidates: string[], limit: number): string[] => {
  const origin = cityById(cityId);
  return candidates
    .filter((id) => id !== cityId)
    .map((id) => ({ id, km: distance(origin, cityById(id)) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
    .map((item) => item.id);
};

/** Споріднені теги: батько, діти, «брати» з тим самим батьком і явні `related`, без повторів. */
export const relatedTagIds = (tagId: string): string[] => {
  const tag = TAGS_BY_ID.get(tagId);
  if (!tag) return [];
  const ids = new Set<string>();
  if (tag.parent) ids.add(tag.parent);
  for (const other of TAGS) {
    if (other.id === tagId) continue;
    if (other.parent === tagId || (tag.parent && other.parent === tag.parent)) ids.add(other.id);
  }
  for (const id of Object.keys(tag.related ?? {})) ids.add(id);
  ids.delete(tagId);
  return [...ids].filter((id) => TAGS_BY_ID.has(id));
};

/** Місто-id або null, коли такого міста немає (адреса з довільним текстом). */
export const knownCityId = (value: string): string | null => CITIES.find((city) => city.id === value)?.id ?? null;

/** Параметри адреси `/poslugy/<слаг>[/<місто>]` → id тегу й міста; `null`, коли слаг чи місто невідомі (сторінка дає 404). */
export const resolveCatalogParams = (slug: string, city?: string): { tagId: string; cityId: string | null } | null => {
  const tagId = tagIdBySlug(slug);
  if (!tagId) return null;
  if (city === undefined) return { tagId, cityId: null };
  const cityId = knownCityId(city);
  return cityId ? { tagId, cityId } : null;
};

/** Виконавець, видимий на карті, у тому вигляді, який потрібен каталогу. */
export interface VisiblePerformer {
  userId: string;
  cityId: string;
  tags: string[];
  name: string;
  specialty: string;
  photo: string;
}

/** Виконавці з сіда dev-бази (`demo-…`) вигадані: у лічильник для індексу не входять. */
export const isDemoUser = (userId: string): boolean => userId.startsWith("demo-");

/** Виконавці тегу (і міста, якщо задано), у порядку вхідного списку. */
export const performersFor = (performers: VisiblePerformer[], tagId: string, cityId: string | null): VisiblePerformer[] =>
  performers.filter((item) => item.tags.includes(tagId) && (cityId === null || item.cityId === cityId));

/** Міста, де є виконавці тегу, із кількістю: від найбільшої. */
export const citiesWithPerformers = (performers: VisiblePerformer[], tagId: string): { cityId: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const item of performersFor(performers, tagId, null)) counts.set(item.cityId, (counts.get(item.cityId) ?? 0) + 1);
  return [...counts].map(([cityId, count]) => ({ cityId, count })).sort((a, b) => b.count - a.count);
};

/** Теги, споріднені з `tagId`, у яких є хоч один виконавець, із кількістю. */
export const relatedWithPerformers = (performers: VisiblePerformer[], tagId: string): { tagId: string; count: number }[] =>
  relatedTagIds(tagId)
    .map((id) => ({ tagId: id, count: performersFor(performers, id, null).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

/** Сторінки, які йдуть в індекс: тег і пара «тег + місто» з трьома й більше справжніми виконавцями. Для sitemap. */
export const indexableCatalogPaths = (performers: VisiblePerformer[]): { tagId: string; cityId: string | null }[] => {
  const byTag = new Map<string, number>();
  const byTagCity = new Map<string, { tagId: string; cityId: string; count: number }>();
  for (const item of performers) {
    if (isDemoUser(item.userId)) continue;
    for (const tagId of new Set(item.tags)) {
      if (!TAGS_BY_ID.has(tagId)) continue;
      byTag.set(tagId, (byTag.get(tagId) ?? 0) + 1);
      const key = `${tagId}|${item.cityId}`;
      const entry = byTagCity.get(key) ?? { tagId, cityId: item.cityId, count: 0 };
      byTagCity.set(key, { ...entry, count: entry.count + 1 });
    }
  }
  return [
    ...[...byTag].filter(([, count]) => catalogIndexable(count)).map(([tagId]) => ({ tagId, cityId: null })),
    ...[...byTagCity.values()].filter((entry) => catalogIndexable(entry.count)).map(({ tagId, cityId }) => ({ tagId, cityId })),
  ];
};
