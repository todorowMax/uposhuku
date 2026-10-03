// GET /api/requests/:id/responses — відгуки на свій запит, за оплатою
// розміщення. Поки браузер питає раз на кілька секунд; потім — WebSocket
// з Durable Object запиту, а цей маршрут лишиться запасним.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { responsesFor } from "@/lib/requests/mock-responses";
import { findRequest } from "@/lib/requests/mock-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const request = findRequest(user.id, (await params).id);
  if (!request) return problem(404, "Запит не знайдено");
  return Response.json({ responses: responsesFor(request) }, { headers: { "cache-control": "no-store" } });
}
