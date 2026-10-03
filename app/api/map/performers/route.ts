// GET /api/map/performers — виконавці з акаунтів, які зараз на карті: профіль
// опубліковано й розміщення оплачено (рівень 2 і вище). Відкрито всім, навіть
// гостю. Віддаємо лише те, що видно на карті: ні пошти, ні id користувача
// (id виконавця — me-<userId>, як у профілях).

import { profileToPerformer } from "@/lib/profile/to-performer";
import { listPublishedProfiles } from "@/lib/server/profile-repo";
import { tiersByUser } from "@/lib/server/placement-repo";
import { failure } from "@/lib/server/route";

export async function GET() {
  try {
    const [profiles, tiers] = await Promise.all([listPublishedProfiles(), tiersByUser()]);
    const performers = [...profiles]
      .flatMap(([userId, profile]) => {
        const tier = tiers.get(userId) ?? 1;
        if (tier < 2) return [];
        const performer = profileToPerformer(profile, userId, 0, tier);
        return performer ? [{ ...performer, mine: false }] : [];
      })
      .slice(0, 500);
    return Response.json({ performers }, { headers: { "cache-control": "public, max-age=15" } });
  } catch (error) {
    return failure(error);
  }
}
