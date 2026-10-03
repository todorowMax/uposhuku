// GET /api/performers/:id — публічний профіль виконавця з акаунтів (id
// виду me-<userId>). Віддаємо лише
// опублікований профіль і лише те, що видно на карті.

import { problem } from "@/lib/api/problem";
import { getPlacement } from "@/lib/server/placement-repo";
import { getProfile } from "@/lib/server/profile-repo";
import { performerStatsOf } from "@/lib/server/stats-repo";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = id.startsWith("me-") ? id.slice(3) : "";
  const profile = userId ? await getProfile(userId) : null;
  if (!profile?.published) return problem(404, "Профіль не знайдено");
  const { name, cityId, location, specialty, bio, tags, works, photo } = profile;
  return Response.json({ profile: { name, cityId, location, specialty, bio, tags, works, photo }, tier: (await getPlacement(userId)).tier, stats: await performerStatsOf(userId), userId });
}
