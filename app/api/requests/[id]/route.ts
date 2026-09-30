// PATCH /api/requests/:id {status: "closed"} — закрити свій запит.

import { problem, readJson } from "@/lib/api/problem";
import { readMockSession } from "@/lib/auth/mock-session";
import { closeRequest } from "@/lib/requests/mock-store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await readMockSession();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  if (body?.status !== "closed") return problem(400, "Можна лише закрити запит");
  const updated = closeRequest(user.id, (await params).id);
  return updated ? Response.json({ request: updated }) : problem(404, "Запит не знайдено");
}
