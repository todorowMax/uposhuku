// PATCH /api/requests/:id
// {status: "closed"} — закрити свій запит;
// повна чернетка (ті самі поля, що в POST) — змінити свій відкритий запит.

import { problem, readJson } from "@/lib/api/problem";
import { parseDraft } from "@/lib/requests/parse-draft";
import { getSessionUser } from "@/lib/server/auth";
import { noteRequestEdited } from "@/lib/server/chat-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { pushGlobal } from "@/lib/server/realtime";
import { closeRequest, updateRequest } from "@/lib/server/request-repo";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  const { id } = await params;
  if (body?.status === "closed") {
    const closed = await closeRequest(user.id, id);
    if (closed) pushGlobal({ t: "feed" });
    return closed ? Response.json({ request: closed }) : problem(404, "Запит не знайдено");
  }
  const limited = await rateLimited("requestEdit", user.id);
  if (limited) return limited;
  const draft = parseDraft(body);
  if (typeof draft === "string") return problem(400, "Запит не заповнено", draft);
  const updated = await updateRequest(user.id, id, draft);
  if (updated === "not_found") return problem(404, "Запит не знайдено");
  if (updated === "closed") return problem(409, "Запит закрито", "Запит закрито, його не можна змінити.");
  // Нових сповіщень «запит під ваші теги» правка не шле: лише службовий рядок тим, хто вже відгукнувся.
  await noteRequestEdited(user.id, id);
  pushGlobal({ t: "feed" });
  return Response.json({ request: updated });
}
