// GET /api/map/requests — відкриті запити для карти. Відкрито всім, навіть
// гостю: це вітрина попиту, яка приводить виконавців. Показуємо лише місто
// (точка зсунута), текст, теги, бюджет і термін, без пошти й імені.
// Для виконавця з опублікованим профілем додаємо збіг з тегами й його відгук.

import { getSessionUser } from "@/lib/server/auth";
import { mapRequests } from "@/lib/feed/mock-feed";
import { getProfile } from "@/lib/server/profile-repo";
import { profileTags } from "@/lib/profile/types";

export async function GET() {
  const user = await getSessionUser();
  const profile = user ? await getProfile(user.id) : null;
  const tags = profile?.published ? profileTags(profile) : [];
  const items = await mapRequests(user?.id ?? null, tags);
  return Response.json({ items, performer: Boolean(profile?.published) }, { headers: { "cache-control": "no-store" } });
}
