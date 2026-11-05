// GET /api/features — що доступно саме цій людині: прапорці функцій як булеві значення. Режимів і списків пошт
// клієнт не бачить.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { featuresFor } from "@/lib/server/features";
import { failure } from "@/lib/server/route";

export const GET = async () => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    return Response.json({ features: await featuresFor(user.email) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
};
