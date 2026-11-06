// POST /api/admin/complaints/:id/close {comment} — модератор закриває скаргу з коментарем. Гроші не рухаються,
// тому другий фактор не потрібен. Закриття (хто, коли, коментар) лишається в самій скарзі; лише для адміністраторів.

import { problem, readJson } from "@/lib/api/problem";
import { checkComment } from "@/lib/admin/decisions";
import { getAdmin } from "@/lib/server/admin";
import { closeComplaint } from "@/lib/server/complaint-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const admin = await getAdmin();
    if (!admin) return problem(404, "Не знайдено");
    const limited = await rateLimited("adminComplaint", admin.id);
    if (limited) return limited;
    const checked = checkComment((await readJson(request))?.comment);
    if ("error" in checked) return problem(400, "Потрібен коментар", checked.error);
    const closed = await closeComplaint((await params).id, { email: admin.email, comment: checked.comment });
    if (!closed) return problem(404, "Не знайдено", "Скарги немає або її вже закрито.");
    return Response.json({ complaint: { id: closed.id, status: closed.status } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
