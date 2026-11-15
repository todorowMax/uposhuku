// PATCH /api/requests/:id/responses/:performerId {status}
// Замовник ставить статус відгуку: new | shortlisted | declined | chosen. Лише автор запиту; чужий запит чи відгук дає 404.

import { problem, readJson } from "@/lib/api/problem";
import { isResponseStatus } from "@/lib/requests/types";
import { getSessionUser } from "@/lib/server/auth";
import { rateLimited } from "@/lib/server/rate-limit";
import { setResponseStatus } from "@/lib/server/responses-repo";

export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string; performerId: string }> }) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const limited = await rateLimited("responseStatus", user.id);
  if (limited) return limited;
  const body = await readJson(request);
  if (!isResponseStatus(body?.status)) return problem(400, "Невідомий статус відгуку");
  const { id, performerId } = await params;
  const result = await setResponseStatus(user.id, { requestId: id, performerId: decodeURIComponent(performerId) }, body.status);
  if (result === "not_found") return problem(404, "Відгук не знайдено");
  if (result === "closed") return problem(409, "Запит закрито", "Закритий запит спершу відновіть.");
  return Response.json({ status: body.status });
};
