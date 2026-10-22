// /api/feed/:id/response — відгук виконавця на запит.
// PUT — надіслати або змінити {price|null, days, message}; DELETE — відкликати.
// Відгукнутися можна на будь-який відкритий чужий запит; замовник бачить
// пропозицію одразу (подія offer у реальному часі).

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { canRespond, parseResponse, removeResponse, saveResponse } from "@/lib/feed/feed";
import { getProfile } from "@/lib/server/profile-repo";
import { pushGlobal, pushUser } from "@/lib/server/realtime";
import { requestBrief, requestOwner } from "@/lib/server/request-repo";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";
import { notifyLater } from "@/lib/server/notify";
import { addSystemMessage } from "@/lib/server/chat-repo";
import { offerNotice } from "@/lib/telegram/notices";

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
  serverEvent(EVENTS.responseSent, { request_id: id, has_price: value.price !== null && value.price !== undefined }, auth.user.id, "/api/feed/response");
  serverEvent(EVENTS.offerReceived, { request_id: id }, (await requestOwner(id))?.userId ?? null, "/api/feed/response");
  await notifyOffer(id);
  // Замовнику в Telegram, якщо він не на сайті.
  const brief = await requestBrief(id);
  if (brief) {
    notifyLater(brief.userId, offerNotice({ requestId: id, requestText: brief.text, price: value.price ?? null, days: value.days }));
    const title = brief.text.length > 40 ? `${brief.text.slice(0, 39).trimEnd()}…` : brief.text;
    const terms = [value.price ? `${value.price} ₴` : "ціна після обговорення", `${value.days} дн.`].join(", ");
    await addSystemMessage(brief.userId, auth.user.id, `Відгук на «${title}»: ${terms}`, id);
  }
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
