// GET /api/map/requests — відкриті запити лише для авторизованого виконавця.
// Показуємо лише місто
// (точка зсунута), текст, теги, бюджет і термін, без пошти й імені.
// Для виконавця з опублікованим профілем додаємо збіг з тегами й його відгук.

import { getSessionUser } from "@/lib/server/auth";
import { mapRequests } from "@/lib/feed/feed";
import { getProfile } from "@/lib/server/profile-repo";
import { profileTags } from "@/lib/profile/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ detail: "Увійдіть, щоб переглянути запити." }, { status: 401 });
  const profile = user ? await getProfile(user.id) : null;
  if (!profile?.published) return Response.json({ detail: "Створіть профіль виконавця, щоб переглянути запити." }, { status: 403 });
  const tags = profile?.published ? profileTags(profile) : [];
  const items = await mapRequests(user.id, tags);
  return Response.json({ items, performer: Boolean(profile?.published) }, { headers: { "cache-control": "no-store" } });
}
