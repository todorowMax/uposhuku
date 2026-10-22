// GET /api/conversations/:id/orders — замовлення (угоди) між цими двома людьми
// для випадайки в шапці розмови. Доступ лише учасникам.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { accessibleConversation, listConversationOrders } from "@/lib/server/chat-repo";
import { failure } from "@/lib/server/route";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const access = await accessibleConversation((await params).id, user.id);
    if (!access) return problem(404, "Розмову не знайдено");
    return Response.json({ orders: await listConversationOrders(access.conversation, access.role) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
}
