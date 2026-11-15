// lib/server/notify-matching.ts
//
// «Перша хвиля запрошень»: новий запит одразу йде в Telegram виконавцям, яким
// він підходить за тегами (та сама формула, що підбір на карті) і за їхніми
// налаштуваннями: поріг збігу, мінімальний бюджет, міста. Своє місто йде вище. Публічний
// канал іде за ними з затримкою (lib/telegram/channel.ts).

import { CITIES } from "@/lib/map/cities";
import type { PublishedRequest } from "@/lib/requests/types";
import type { MatchingPrefs, NotificationPrefs } from "@/lib/notification-prefs";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { matchProfiles, matchScore } from "@/lib/tags/match";
import { profileTags } from "@/lib/profile/types";
import { matchNotice } from "@/lib/telegram/notices";
import { telemetryConfig } from "@/lib/telemetry/server";
import { notifyUser } from "./notify";
import { getPrefsMap } from "./notification-prefs-repo";
import { listPublishedProfiles } from "./profile-repo";

/** Скільки виконавців отримують сповіщення про один запит: найкращі за збігом. */
export const MATCH_NOTIFY_MAX = 30;

/** Що потрібно знати про запит для підбору. */
export interface MatchRequest {
  tags: string[];
  cityId?: string | null;
  /** Бюджет у гривнях; без нього запит не відсіюється порогом бюджету. */
  budget?: number | null;
}

/** Виконавець-кандидат: теги, місто профілю й, якщо збережені, його налаштування сповіщень. */
export interface MatchCandidate {
  tags: string[];
  cityId?: string;
  prefs?: Pick<NotificationPrefs, "kinds" | "matching">;
}

/** Теги, за якими міряємо збіг: навичка важливіша за галузь (як у `matchProfiles`). */
const skillTags = (requestTags: string[]) => {
  const skills = requestTags.filter((id) => TAGS_BY_ID.get(id)?.group !== "industry");
  return skills.length ? skills : requestTags;
};

/**
 * Чи підходить запит за містом. Запит без міста («Віддалено») підходить усім; виконавцю без міста
 * в профілі режим «моє місто» нічого не відсіює (міста він не назвав).
 */
export const cityAllowed = (prefs: MatchingPrefs, profileCityId: string | undefined, requestCityId: string | null | undefined): boolean => {
  if (!requestCityId) return true;
  if (prefs.area === "own") return !profileCityId || profileCityId === requestCityId;
  if (prefs.area === "chosen") return prefs.cityIds.includes(requestCityId);
  return true;
};

/** Налаштування кандидата пропускають цей запит: вид сповіщень увімкнено, поріг збігу, бюджет, місто. */
const passesPrefs = (request: MatchRequest, candidate: MatchCandidate, score: number): boolean => {
  const prefs = candidate.prefs;
  if (!prefs) return true;
  if (!prefs.kinds.matching || score < prefs.matching.minMatch) return false;
  if (request.budget && request.budget < prefs.matching.minBudget) return false;
  return cityAllowed(prefs.matching, candidate.cityId, request.cityId);
};

/**
 * Кому слати: збіг тегів як на карті, потім налаштування людини (поріг, бюджет, міста), найкращі
 * першими. За однакового збігу вище виконавці з міста запиту. Автора виключено, не більше MATCH_NOTIFY_MAX.
 */
export const pickMatching = (request: MatchRequest, profiles: Map<string, MatchCandidate>, authorId: string): string[] => {
  const list = [...profiles.entries()].filter(([userId]) => userId !== authorId).map(([id, profile]) => ({ id, profile }));
  const matched = matchProfiles(request.tags, list.map((item) => ({ id: item.id, tags: item.profile.tags })));
  if (!matched) return [];
  const wanted = skillTags(request.tags);
  return list
    .filter((item) => matched.has(item.id))
    .map((item) => ({ id: item.id, score: matchScore(request.tags, item.profile.tags), strict: matchScore(wanted, item.profile.tags), sameCity: Boolean(request.cityId) && item.profile.cityId === request.cityId, profile: item.profile }))
    .filter((item) => passesPrefs(request, item.profile, item.strict))
    .sort((a, b) => b.score - a.score || Number(b.sameCity) - Number(a.sameCity) || a.id.localeCompare(b.id))
    .slice(0, MATCH_NOTIFY_MAX)
    .map((item) => item.id);
};

/** Після відповіді API. Нічого не кидає. */
export const notifyMatchingPerformers = (request: PublishedRequest, authorId: string): void => {
  const work = (async () => {
    try {
      const tags = request.tags.map((tag) => tag.id);
      if (tags.length === 0) return;
      const published = await listPublishedProfiles();
      const prefs = await getPrefsMap([...published.keys()]);
      const profiles = new Map<string, MatchCandidate>([...published].map(([userId, profile]) => [userId, { tags: profileTags(profile), cityId: profile.cityId || undefined, prefs: prefs.get(userId) }]));
      const city = CITIES.find((item) => item.id === request.cityId)?.name;
      for (const userId of pickMatching({ tags, cityId: request.cityId, budget: request.budget }, profiles, authorId)) {
        await notifyUser(userId, matchNotice({ requestId: request.id, userId, text: request.text, budget: request.budget ? `до ${new Intl.NumberFormat("uk-UA").format(request.budget)} ₴` : null, place: city ?? "Віддалено" }));
      }
    } catch {
      // Сповіщення не мають ламати публікацію запиту.
    }
  })();
  if (telemetryConfig.waitUntil) telemetryConfig.waitUntil(work);
  else void work;
};
