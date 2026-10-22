// lib/server/notify-matching.ts
//
// «Перша хвиля запрошень»: новий запит одразу йде в Telegram виконавцям, яким
// він підходить за тегами (та сама формула, що підбір на карті). Публічний
// канал іде за ними з затримкою (lib/telegram/channel.ts).

import { CITIES } from "@/lib/map/cities";
import type { PublishedRequest } from "@/lib/requests/types";
import { matchProfiles, matchScore } from "@/lib/tags/match";
import { profileTags } from "@/lib/profile/types";
import { matchNotice } from "@/lib/telegram/notices";
import { telemetryConfig } from "@/lib/telemetry/server";
import { notifyUser } from "./notify";
import { listPublishedProfiles } from "./profile-repo";

/** Скільки виконавців отримують сповіщення про один запит: найкращі за збігом. */
export const MATCH_NOTIFY_MAX = 30;

export const pickMatching = (requestTags: string[], profiles: Map<string, { tags: string[] }>, authorId: string): string[] => {
  const list = [...profiles.entries()].filter(([userId]) => userId !== authorId).map(([id, profile]) => ({ id, tags: profile.tags }));
  const matched = matchProfiles(requestTags, list);
  if (!matched) return [];
  return list
    .filter((profile) => matched.has(profile.id))
    .map((profile) => ({ id: profile.id, score: matchScore(requestTags, profile.tags) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MATCH_NOTIFY_MAX)
    .map((item) => item.id);
};

/** Після відповіді API. Нічого не кидає. */
export const notifyMatchingPerformers = (request: PublishedRequest, authorId: string): void => {
  const work = (async () => {
    try {
      const tags = request.tags.map((tag) => tag.id);
      if (tags.length === 0) return;
      const profiles = new Map([...(await listPublishedProfiles())].map(([userId, profile]) => [userId, { tags: profileTags(profile) }]));
      const city = CITIES.find((item) => item.id === request.cityId)?.name;
      for (const userId of pickMatching(tags, profiles, authorId)) {
        await notifyUser(userId, matchNotice({ requestId: request.id, userId, text: request.text, budget: request.budget ? `до ${new Intl.NumberFormat("uk-UA").format(request.budget)} ₴` : null, place: city ?? "Віддалено" }));
      }
    } catch {
      // Сповіщення не мають ламати публікацію запиту.
    }
  })();
  if (telemetryConfig.waitUntil) telemetryConfig.waitUntil(work);
  else void work;
};
