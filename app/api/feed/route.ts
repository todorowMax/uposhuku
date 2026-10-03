// GET /api/feed — запити під теги профілю виконавця, найвідповідніші
// першими. Без опублікованого профілю стрічки немає. Поки браузер питає
// раз на кілька секунд; потім — WebSocket, цей маршрут лишиться запасним.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { feedFor } from "@/lib/feed/feed";
import { getProfile } from "@/lib/server/profile-repo";
import { profileTags } from "@/lib/profile/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const profile = await getProfile(user.id);
  if (!profile?.published) return problem(403, "Стрічка з'явиться після публікації профілю", "Опублікуйте профіль виконавця, і ми покажемо запити під ваші теги.");
  return Response.json({ items: await feedFor(user.id, profileTags(profile)) }, { headers: { "cache-control": "no-store" } });
}
