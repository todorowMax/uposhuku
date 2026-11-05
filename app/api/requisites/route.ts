// /api/requisites — власні реквізити виконавця для прямого переказу.
// GET — поточні значення й зміна, що чекає; PUT — зберегти (перше одразу, наступні з затримкою 24 години й листом).

import { problem, readJson } from "@/lib/api/problem";
import { validateRequisites } from "@/lib/deals/requisites";
import { getSessionUser } from "@/lib/server/auth";
import { sendRequisitesChangeNotice } from "@/lib/server/mail";
import { getOwnRequisites, saveOwnRequisites } from "@/lib/server/requisites-repo";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";
import { logServer } from "@/lib/telemetry/log";

const HEADERS = { "cache-control": "no-store" };

const unavailable = () => problem(503, "Реквізити тимчасово недоступні", "Зберігання реквізитів ще не налаштоване. Спробуйте пізніше.");

export const GET = async () => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    return Response.json(await getOwnRequisites(user.id), { headers: HEADERS });
  } catch (error) {
    return error instanceof SecretBoxUnavailableError ? unavailable() : failure(error);
  }
};

export const PUT = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const checked = validateRequisites(await readJson(request));
  if (!checked.ok) return problem(400, "Реквізити не збережено", checked.error);
  try {
    const outcome = await saveOwnRequisites(user.id, checked.value);
    if (outcome.kind === "pending") {
      // Лист про зміну: без нього затримка не захищає. Збій пошти не скасовує збереження, але потрапляє в журнал.
      try {
        await sendRequisitesChangeNotice(user.email, outcome.effectiveAt);
      } catch {
        logServer({ level: "error", event: "requisites_notice_failed", message: "Не вдалося надіслати лист про зміну реквізитів", detail: {} });
      }
    }
    return Response.json({ outcome, ...(await getOwnRequisites(user.id)) }, { headers: HEADERS });
  } catch (error) {
    return error instanceof SecretBoxUnavailableError ? unavailable() : failure(error, request);
  }
};
