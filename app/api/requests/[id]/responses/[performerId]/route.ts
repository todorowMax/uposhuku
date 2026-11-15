// PATCH /api/requests/:id/responses/:performerId {status}
// Замовник ставить статус відгуку: new | shortlisted | declined | chosen. Лише автор запиту; чужий запит чи відгук дає 404.

import { problem, readJson } from "@/lib/api/problem";
import { isResponseStatus } from "@/lib/requests/types";
import { setResponseStatus } from "@/lib/server/responses-repo";
import { route } from "@/lib/server/route";

export const PATCH = route<"user", undefined, { id: string; performerId: string }>({ auth: "user", rate: "responseStatus" }, async ({ request, user, params }) => {
  const body = await readJson(request);
  if (!isResponseStatus(body?.status)) return problem(400, "Невідомий статус відгуку");
  const { id, performerId } = params;
  const result = await setResponseStatus(user.id, { requestId: id, performerId: decodeURIComponent(performerId) }, body.status);
  if (result === "not_found") return problem(404, "Відгук не знайдено");
  if (result === "closed") return problem(409, "Запит закрито", "Закритий запит спершу відновіть.");
  return Response.json({ status: body.status });
});
