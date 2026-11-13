// /api/account/delete — видалення акаунта самою людиною.
// GET: що заважає (угоди з грошима в русі, відкриті скарги) і чи потрібен код з пошти (були угоди).
// POST {confirm: "ВИДАЛИТИ", code?}: видалити. Рядок у users лишається «могилою» (lib/server/account-delete.ts).

import { problem, readJson } from "@/lib/api/problem";
import { isDeleteWord } from "@/lib/account/deletion";
import { verifyDeletionCode } from "@/lib/server/account-code";
import { deleteAccount, deleteBlockers, hasDeals } from "@/lib/server/account-delete";
import { closeSession, getSessionUser } from "@/lib/server/auth";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";

const HEADERS = { "cache-control": "no-store" };

const blockedResponse = (blockers: unknown) => Response.json({ type: "about:blank", title: "Акаунт поки не можна видалити", status: 409, detail: "Спершу закрийте те, що в списку.", code: "delete_blocked", blockers }, { status: 409, headers: { ...HEADERS, "content-type": "application/problem+json" } });

export const GET = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const [blockers, needsCode] = await Promise.all([deleteBlockers(user.id), hasDeals(user.id)]);
    return Response.json({ blockers, needsCode }, { headers: HEADERS });
  } catch (error) {
    return failure(error, request);
  }
};

export const POST = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("accountDelete", user.id);
    if (limited) return limited;
    const body = await readJson(request);
    if (!isDeleteWord(body?.confirm)) return problem(400, "Слово не збігається", "Введіть слово ВИДАЛИТИ, щоб підтвердити.", "about:blank", "confirm_word");
    const blockers = await deleteBlockers(user.id);
    if (blockers.length > 0) return blockedResponse(blockers);
    // Людям, у яких були угоди, потрібен ще й код з пошти: вхід захищено сесією, а гроші й докази важливіші.
    if (await hasDeals(user.id)) {
      const outcome = await verifyDeletionCode(user.id, body?.code);
      if (outcome !== "ok") return problem(403, "Код не підійшов", outcome === "expired" ? "Код прострочений або спроби вичерпано. Запросіть новий." : "Невірний код. Спробуйте ще раз.", "about:blank", "delete_code");
    }
    const result = await deleteAccount(user.id);
    if (result.kind === "blocked") return blockedResponse(result.blockers);
    await closeSession();
    return Response.json({ deleted: true }, { headers: HEADERS });
  } catch (error) {
    return failure(error, request);
  }
};
