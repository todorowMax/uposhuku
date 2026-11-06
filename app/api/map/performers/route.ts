// GET /api/map/performers — виконавці з акаунтів, які зараз на карті: профіль
// опубліковано й розміщення оплачено (рівень 2 і вище). Відкрито всім, навіть
// гостю. Віддаємо лише те, що видно на карті: ні пошти, ні id користувача
// (id виконавця — me-<userId>, як у профілях).

import { profileToPerformer } from "@/lib/profile/to-performer";
import { listPublishedProfiles } from "@/lib/server/profile-repo";
import { tiersByUser } from "@/lib/server/placement-repo";
import { onlineUsers } from "@/lib/server/presence-repo";
import { allPerformerStats } from "@/lib/server/stats-repo";
import { edgeCached } from "@/lib/server/edge-cache";
import { failure } from "@/lib/server/route";

/** Скільки секунд карта береться з кешу краю (спільний для всіх, лише публічні дані: `mine` завжди false). */
const MAP_CACHE_TTL = 20;

const compute = async () => {
  const [profiles, tiers, stats, online] = await Promise.all([listPublishedProfiles(), tiersByUser(), allPerformerStats(), onlineUsers()]);
  const performers = [...profiles]
    .flatMap(([userId, profile]) => {
      const tier = tiers.get(userId) ?? 1;
      if (tier < 2) return [];
      const performer = profileToPerformer(profile, userId, 0, tier);
      return performer ? [{ ...performer, mine: false, online: online.has(userId), stats: stats.get(performer.id) }] : [];
    })
    .slice(0, 500);
  return { performers };
};

export const GET = async (request: Request) => {
  try {
    return await edgeCached({ request, name: "map-performers", ttl: MAP_CACHE_TTL, compute });
  } catch (error) {
    return failure(error);
  }
};
