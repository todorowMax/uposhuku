// GET /api/admin/payouts — заявки виконавців на виплати: спершу ті, що чекають перевірки. Лише адміністратори (404 решті).

import { problem } from "@/lib/api/problem";
import { getAdmin } from "@/lib/server/admin";
import { listPayoutApplications } from "@/lib/server/payout-repo";
import { failure } from "@/lib/server/route";

export const GET = async (request: Request) => {
  try {
    if (!(await getAdmin())) return problem(404, "Не знайдено");
    return Response.json({ applications: await listPayoutApplications() }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
