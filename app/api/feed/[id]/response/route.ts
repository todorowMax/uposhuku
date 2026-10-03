// /api/feed/:id/response — відгук виконавця на запит.
// PUT — надіслати або змінити {price|null, days, message}; DELETE — відкликати.
// Справжня версія: таблиця responses, подія в Durable Object запиту, щоб
// замовник побачив пропозицію одразу.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { feedHas, parseResponse, removeResponse, saveResponse } from "@/lib/feed/feed";
import { getProfile } from "@/lib/server/profile-repo";
import { profileTags } from "@/lib/profile/types";

const authorize = async (id: string) => {
  const user = await getSessionUser();
  if (!user) return { error: problem(401, "Потрібен вхід") };
  const profile = await getProfile(user.id);
  if (!profile?.published) return { error: problem(403, "Спершу опублікуйте профіль виконавця") };
  if (!(await feedHas(user.id, id, profileTags(profile)))) return { error: problem(404, "Запит не знайдено", "Цього запиту вже немає у вашій стрічці.") };
  return { user };
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;
  const value = parseResponse(await readJson(request));
  if (typeof value === "string") return problem(400, "Відгук не надіслано", value);
  return Response.json({ response: await saveResponse(auth.user.id, id, value) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;
  await removeResponse(auth.user.id, id);
  return new Response(null, { status: 204 });
}
