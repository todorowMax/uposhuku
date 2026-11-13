// GET /api/account/export — виписка всіх даних людини одним JSON-файлом (не більше 3 разів на годину).
// Лише свої дані: чужі особисті значення замінені міткою, секретів немає (lib/server/account-export.ts).

import { problem } from "@/lib/api/problem";
import { buildAccountExport } from "@/lib/server/account-export";
import { getSessionUser } from "@/lib/server/auth";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";

export const GET = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("accountExport", user.id);
    if (limited) return limited;
    const data = await buildAccountExport(user.id);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="findlyfy-my-data-${day}.json"`, "cache-control": "no-store" },
    });
  } catch (error) {
    return failure(error, request);
  }
};
