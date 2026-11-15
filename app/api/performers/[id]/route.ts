// GET /api/performers/:id — публічний профіль виконавця з акаунтів (id
// виду me-<userId>). Віддаємо лише
// опублікований профіль і лише те, що видно на карті.

import { problem } from "@/lib/api/problem";
import { getPlacement } from "@/lib/server/placement-repo";
import { getProfile } from "@/lib/server/profile-repo";
import { isOnline } from "@/lib/server/presence-repo";
import { performerStatsOf } from "@/lib/server/stats-repo";
import { route } from "@/lib/server/route";

export const GET = route<"none", undefined, { id: string }>({}, async ({ params }) => {
  const { id } = params;
  const userId = id.startsWith("me-") ? id.slice(3) : "";
  const profile = userId ? await getProfile(userId) : null;
  if (!profile?.published) return problem(404, "Профіль не знайдено");
  const { name, cityId, location, specialty, bio, tags, works, photo } = profile;
  return Response.json({ profile: { name, cityId, location, specialty, bio, tags, works, photo }, tier: (await getPlacement(userId)).tier, stats: await performerStatsOf(userId), online: await isOnline(userId), userId });
});
