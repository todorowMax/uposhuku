// GET /api/feed?cursor= — запити для виконавця сторінками: найвідповідніші першими
// (теги профілю, потім його місто, потім свіжіші). Відповідь: {items, next, total};
// `next` — курсор для «Показати ще», null, коли далі нічого. Без опублікованого
// профілю стрічки немає. Браузер питає першу сторінку раз на кілька секунд і за подією
// `feed` (з випадковою затримкою, див. lib/realtime/client.tsx).

import { problem } from "@/lib/api/problem";
import { feedPage } from "@/lib/feed/feed";
import { getProfile } from "@/lib/server/profile-repo";
import { profileTags } from "@/lib/profile/types";
import { route } from "@/lib/server/route";

export const GET = route({ auth: "user" }, async ({ request, user }) => {
  const profile = await getProfile(user.id);
  if (!profile?.published) return problem(403, "Стрічка з'явиться після публікації профілю", "Опублікуйте профіль виконавця, і ми покажемо запити під ваші теги.");
  const cursor = new URL(request.url).searchParams.get("cursor");
  return Response.json(await feedPage(user.id, { viewer: { tags: profileTags(profile), cityId: profile.cityId || null }, cursor }), { headers: { "cache-control": "no-store" } });
});
