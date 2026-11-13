// POST /api/account/delete/code — код на пошту акаунта для підтвердження видалення (лише тим, у кого були угоди).

import { problem } from "@/lib/api/problem";
import { sendDeletionCode } from "@/lib/server/account-code";
import { hasDeals } from "@/lib/server/account-delete";
import { getSessionUser } from "@/lib/server/auth";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";

export const POST = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("accountDeleteCode", user.id);
    if (limited) return limited;
    if (!(await hasDeals(user.id))) return problem(409, "Код не потрібен", "Для вашого акаунта код підтвердження не потрібен.");
    const outcome = await sendDeletionCode(user.id, user.email);
    return Response.json({ sent: outcome === "sent" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
