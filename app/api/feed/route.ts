// GET /api/feed — запити під теги профілю виконавця, найвідповідніші
// першими. Без опублікованого профілю стрічки немає. Поки браузер питає
// раз на кілька секунд; потім — WebSocket, цей маршрут лишиться запасним.

import { problem } from "@/lib/api/problem";
import { readMockSession } from "@/lib/auth/mock-session";
import { feedFor } from "@/lib/feed/mock-feed";
import { getProfile } from "@/lib/profile/mock-store";
import { profileTags } from "@/lib/profile/types";

export async function GET() {
  const user = await readMockSession();
  if (!user) return problem(401, "Потрібен вхід");
  const profile = getProfile(user.id);
  if (!profile?.published) return problem(403, "Стрічка з'явиться після публікації профілю", "Опублікуйте профіль виконавця, і ми покажемо запити під ваші теги.");
  return Response.json({ items: feedFor(user.id, profileTags(profile)) }, { headers: { "cache-control": "no-store" } });
}
