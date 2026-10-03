// PATCH /api/requests/:id {status: "closed"} — закрити свій запит.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { pushGlobal } from "@/lib/server/realtime";
import { closeRequest } from "@/lib/server/request-repo";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  if (body?.status !== "closed") return problem(400, "Можна лише закрити запит");
  const updated = await closeRequest(user.id, (await params).id);
  if (updated) pushGlobal({ t: "feed" });
  return updated ? Response.json({ request: updated }) : problem(404, "Запит не знайдено");
}
