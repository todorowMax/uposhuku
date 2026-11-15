// GET /api/requests/:id/responses — відгуки на свій запит, за оплатою
// розміщення. Поки браузер питає раз на кілька секунд; потім — WebSocket
// з Durable Object запиту, а цей маршрут лишиться запасним.

import { problem } from "@/lib/api/problem";
import { responsesFor } from "@/lib/requests/responses";
import { findRequest } from "@/lib/server/request-repo";
import { route } from "@/lib/server/route";

export const GET = route<"user", undefined, { id: string }>({ auth: "user" }, async ({ user, params }) => {
  const request = await findRequest(user.id, params.id);
  if (!request) return problem(404, "Запит не знайдено");
  return Response.json({ responses: await responsesFor(request) }, { headers: { "cache-control": "no-store" } });
});
