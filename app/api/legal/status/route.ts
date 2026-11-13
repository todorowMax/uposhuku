// GET /api/legal/status — що увійшовшому треба прийняти заново: оновлені умови (`pending`) і чи прийнято ризик крипти.
// Грошові дії без прийняття дають 409 `legal_reaccept_required`; цей запит лише підказує клієнту, що показати.

import { problem } from "@/lib/api/problem";
import { LEGAL_VERSIONS } from "@/lib/legal/config";
import { getSessionUser } from "@/lib/server/auth";
import { pendingFor, riskAccepted } from "@/lib/server/legal-repo";
import { failure } from "@/lib/server/route";

export const GET = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const [pending, risk] = await Promise.all([pendingFor(user.id), riskAccepted(user.id)]);
    return Response.json({ versions: LEGAL_VERSIONS, pending, riskAccepted: risk }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
