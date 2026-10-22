// GET /api/admin/disputes/:dealId — картка спору: угода, сторони, вся переписка пари
// і журнал рішень. Лише для адміністраторів; для угоди без спору теж 404.

import { problem } from "@/lib/api/problem";
import { getAdmin } from "@/lib/server/admin";
import { getDisputeCard } from "@/lib/server/admin-repo";
import { failure } from "@/lib/server/route";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getAdmin())) return problem(404, "Не знайдено");
    const card = await getDisputeCard((await params).id);
    if (!card) return problem(404, "Не знайдено");
    return Response.json(card, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
}
