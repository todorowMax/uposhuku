// PATCH /api/requests/:id
// {status: "closed"} — закрити свій запит; {status: "open"} — відновити закритий протягом доби;
// {renew: true} — «ще актуально»: строк життя (14 днів) іде заново;
// повна чернетка (ті самі поля, що в POST) — змінити свій відкритий запит.

import { problem, readJson } from "@/lib/api/problem";
import { parseDraft } from "@/lib/requests/parse-draft";
import { noteRequestEdited } from "@/lib/server/chat-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { pushGlobal } from "@/lib/server/realtime";
import { checkDraftFiles } from "@/lib/server/request-files";
import { renewRequest } from "@/lib/server/request-lifetime";
import { closeRequest, findRequest, reopenRequest, updateRequest } from "@/lib/server/request-repo";
import { route } from "@/lib/server/route";

/** «Так, ще актуально»: строк життя заново; виконавцям нічого не йде, стрічка не змінюється. */
const renewResponse = async (userId: string, id: string) => {
  const renewed = await renewRequest(userId, id);
  if (renewed === "not_found") return problem(404, "Запит не знайдено");
  if (renewed === "closed") return problem(409, "Запит закрито", "Закритий запит спершу відновіть.");
  return Response.json({ request: renewed });
};

/** Відновлення не шле «новий запит під ваші теги» і не пише службових рядків у розмови. */
const reopenResponse = async (userId: string, id: string) => {
  const reopened = await reopenRequest(userId, id);
  if (reopened === "not_found") return problem(404, "Запит не знайдено");
  if (reopened === "window_expired") return problem(409, "Вікно відновлення минуло", "Запит уже не відновити: вікно відновлення минуло.");
  pushGlobal({ t: "feed" });
  return Response.json({ request: reopened });
};

export const PATCH = route<"user", undefined, { id: string }>({ auth: "user" }, async ({ request, user, params }) => {
  const body = await readJson(request);
  const { id } = params;
  if (body?.status === "closed") {
    const closed = await closeRequest(user.id, id);
    if (closed) pushGlobal({ t: "feed" });
    return closed ? Response.json({ request: closed }) : problem(404, "Запит не знайдено");
  }
  const limited = await rateLimited("requestEdit", user.id);
  if (limited) return limited;
  if (body?.renew === true) return renewResponse(user.id, id);
  if (body?.status === "open") return reopenResponse(user.id, id);
  const current = await findRequest(user.id, id);
  const draft = parseDraft(body, { now: new Date(), keepDate: current?.deadlineDate ?? null });
  if (typeof draft === "string") return problem(400, "Запит не заповнено", draft);
  const filesError = current ? await checkDraftFiles(user.id, id, draft.files) : null;
  if (filesError) return problem(400, "Файли не прийнято", filesError);
  const updated = await updateRequest(user.id, id, draft);
  if (updated === "not_found") return problem(404, "Запит не знайдено");
  if (updated === "closed") return problem(409, "Запит закрито", "Запит закрито, його не можна змінити.");
  // Нових сповіщень «запит під ваші теги» правка не шле: лише службовий рядок тим, хто вже відгукнувся.
  await noteRequestEdited(user.id, id);
  pushGlobal({ t: "feed" });
  return Response.json({ request: updated });
});
