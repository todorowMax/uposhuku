// /api/feed/:id/response — відгук виконавця на запит.
// PUT — надіслати або змінити {price|null, days, message}; DELETE — відкликати.
// Відгукнутися можна на будь-який відкритий чужий запит; замовник бачить
// пропозицію одразу (подія offer у реальному часі).

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { canRespond, parseResponse, removeResponse, saveResponse } from "@/lib/feed/feed";
import { getProfile } from "@/lib/server/profile-repo";
import { pushGlobal, pushUser } from "@/lib/server/realtime";
import { requestOwner } from "@/lib/server/request-repo";

/** Замовник бачить відгук одразу, а всі — лічильник відгуків у стрічці. */
const notifyOffer = async (requestId: string) => {
  pushUser((await requestOwner(requestId))?.userId, { t: "offer", requestId });
  pushGlobal({ t: "feed" });
};

const authorize = async (id: string) => {
  const user = await getSessionUser();
  if (!user) return { error: problem(401, "Потрібен вхід") };
  const profile = await getProfile(user.id);
  if (!profile?.published) return { error: problem(403, "Спершу опублікуйте профіль виконавця") };
  if (!(await canRespond(user.id, id))) return { error: problem(404, "Запит не знайдено", "Цей запит уже закрито, його немає або він ваш власний.") };
  return { user };
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;
  const value = parseResponse(await readJson(request));
  if (typeof value === "string") return problem(400, "Відгук не надіслано", value);
  const saved = await saveResponse(auth.user.id, id, value);
  await notifyOffer(id);
  return Response.json({ response: saved });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;
  await removeResponse(auth.user.id, id);
  await notifyOffer(id);
  return new Response(null, { status: 204 });
}
