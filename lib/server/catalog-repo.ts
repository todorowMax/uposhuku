// lib/server/catalog-repo.ts
//
// Дані сторінок каталогу `/poslugy/<тег>[/<місто>]`: виконавці, видимі на карті (опублікований профіль і розміщення від
// 2-го рівня, як у /api/map/performers), кількість відкритих публічних запитів тегу й медіана їхніх бюджетів. Віддаємо
// лише публічні поля: без пошти й id користувача (id виконавця `me-<userId>` і так в адресі профілю).

import { and, eq } from "drizzle-orm";
import { requestTags, requests } from "@/db/schema";
import { CITIES } from "@/lib/map/cities";
import { profileTags } from "@/lib/profile/types";
import { publicPhotoUrl } from "@/lib/profile/public";
import {
  citiesWithPerformers,
  indexableCatalogPaths,
  isDemoUser,
  medianBudget,
  performersFor,
  relatedWithPerformers,
  catalogIndexable,
  type VisiblePerformer,
} from "@/lib/seo/catalog";
import { getDb } from "./db";
import { tiersByUser } from "./placement-repo";
import { listPublishedProfiles } from "./profile-repo";
import { reviewStatsFor } from "./review-repo";

/** Скільки виконавців тримаємо в пам'яті (як на карті) і скільки показуємо на сторінці. */
const VISIBLE_LIMIT = 500;
const LIST_LIMIT = 40;
/** Стеля вибірки бюджетів: для медіани вистачає свіжих. */
const REQUEST_LIMIT = 1000;

export interface CatalogPerformer {
  id: string;
  name: string;
  specialty: string;
  city: string;
  cityId: string;
  photoUrl: string | null;
  rating: number | null;
  reviews: number;
}

export interface CatalogData {
  tagId: string;
  cityId: string | null;
  /** Скільки виконавців на карті для цього тегу (і міста). */
  performerCount: number;
  performers: CatalogPerformer[];
  openRequests: number;
  /** Медіана бюджетів відкритих запитів, що мають бюджет; `null`, коли таких немає. */
  medianBudget: number | null;
  /** Міста, де є виконавці тегу. */
  cities: { cityId: string; count: number }[];
  relatedTags: { tagId: string; count: number }[];
  /** Сторінку можна індексувати: достатньо справжніх виконавців. */
  indexable: boolean;
}

/** Виконавці, видимі на карті, у вигляді для каталогу. */
export const loadVisiblePerformers = async (): Promise<VisiblePerformer[]> => {
  const [profiles, tiers] = await Promise.all([listPublishedProfiles(), tiersByUser()]);
  return [...profiles]
    .filter(([userId, profile]) => (tiers.get(userId) ?? 1) >= 2 && CITIES.some((city) => city.id === profile.cityId))
    .slice(0, VISIBLE_LIMIT)
    .map(([userId, profile]) => ({
      userId,
      cityId: profile.cityId,
      tags: profileTags(profile),
      name: profile.name.trim(),
      specialty: profile.specialty.trim(),
      photo: profile.photo,
    }));
};

/** Бюджети відкритих запитів, які автор дозволив показувати, з цим тегом (і містом). Лише числа й кількість. */
const openRequestBudgets = async (tagId: string, cityId: string | null): Promise<(number | null)[]> => {
  const db = getDb();
  const rows = await db
    .select({ budget: requests.budget })
    .from(requests)
    .innerJoin(requestTags, eq(requestTags.requestId, requests.id))
    .where(
      and(
        eq(requestTags.tagId, tagId),
        eq(requests.status, "open"),
        eq(requests.channelOptIn, true),
        cityId ? eq(requests.cityId, cityId) : undefined,
      ),
    )
    .limit(REQUEST_LIMIT);
  return rows.map((row) => row.budget);
};

const toCatalogPerformer = (
  item: VisiblePerformer,
  stats: Map<string, { count: number; average: number | null }>,
): CatalogPerformer => {
  const rating = stats.get(`me-${item.userId}`);
  return {
    id: `me-${item.userId}`,
    name: item.name,
    specialty: item.specialty,
    city: CITIES.find((city) => city.id === item.cityId)?.name ?? "",
    cityId: item.cityId,
    photoUrl: publicPhotoUrl(item.photo),
    rating: rating?.average ?? null,
    reviews: rating?.count ?? 0,
  };
};

/** Каталог тегу (і міста). Невідомий тег чи місто перевіряє сторінка до виклику. */
export const getCatalog = async (tagId: string, cityId: string | null): Promise<CatalogData> => {
  const visible = await loadVisiblePerformers();
  const matching = performersFor(visible, tagId, cityId);
  const shown = matching.slice(0, LIST_LIMIT);
  const [budgets, stats] = await Promise.all([
    openRequestBudgets(tagId, cityId),
    reviewStatsFor(shown.map((item) => `me-${item.userId}`)),
  ]);
  const real = matching.filter((item) => !isDemoUser(item.userId)).length;
  return {
    tagId,
    cityId,
    performerCount: matching.length,
    performers: shown.map((item) => toCatalogPerformer(item, stats)),
    openRequests: budgets.length,
    medianBudget: medianBudget(budgets),
    cities: citiesWithPerformers(visible, tagId),
    relatedTags: relatedWithPerformers(visible, tagId).slice(0, 8),
    indexable: catalogIndexable(real),
  };
};

/** Сторінки каталогу для sitemap: лише ті, що проходять поріг індексації. Читає тільки профілі й рівні, без запитів. */
export const listIndexableCatalogPaths = async (): Promise<{ tagId: string; cityId: string | null }[]> =>
  indexableCatalogPaths(await loadVisiblePerformers());
