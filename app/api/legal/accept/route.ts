// POST /api/legal/accept { docs: [{ doc, version }] } — людина приймає документи. Лише відомі документи й лише
// чинні версії (застарілу версію сервер відхиляє 409, клієнт перечитує статус). Джерело згоди сервер обирає сам.

import { problem, readJson } from "@/lib/api/problem";
import { readAcceptRequest } from "@/lib/legal/acceptance";
import { getSessionUser } from "@/lib/server/auth";
import { pendingFor, recordAcceptance, riskAccepted } from "@/lib/server/legal-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { clientIp, failure } from "@/lib/server/route";

export const POST = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("legalAccept", user.id);
    if (limited) return limited;
    const parsed = readAcceptRequest(await readJson(request));
    if (!parsed.ok) return problem(parsed.status, "Згоду не записано", parsed.error);
    await recordAcceptance({ userId: user.id, docs: parsed.docs, ip: clientIp(request) });
    const [pending, risk] = await Promise.all([pendingFor(user.id), riskAccepted(user.id)]);
    return Response.json({ pending, riskAccepted: risk }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error, request);
  }
};
