// /api/requisites — власні реквізити виконавця для прямого переказу.
// GET — поточні значення й зміна, що чекає; PUT — зберегти (перше одразу, наступні з затримкою 24 години й листом).

import { problem, readJson } from "@/lib/api/problem";
import { validateRequisites, withoutCrypto, type Requisites } from "@/lib/deals/requisites";
import { getSessionUser } from "@/lib/server/auth";
import { featureEnabledFor } from "@/lib/server/features";
import { sendRequisitesChangeNotice } from "@/lib/server/mail";
import { getOwnRequisites, saveOwnRequisites } from "@/lib/server/requisites-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";
import { logServer } from "@/lib/telemetry/log";

const HEADERS = { "cache-control": "no-store" };

/** Крипто-поля бачить і міняє лише той, кому ввімкнено `crypto_proof`. */
const forUser = async <T extends { requisites: Requisites | null; pending: { requisites: Requisites; mask: string; effectiveAt: number } | null }>(data: T, email: string): Promise<T & { crypto: boolean }> => {
  if (await featureEnabledFor("crypto_proof", email)) return { ...data, crypto: true };
  return { ...data, crypto: false, requisites: data.requisites && withoutCrypto(data.requisites), pending: data.pending && { ...data.pending, requisites: withoutCrypto(data.pending.requisites) } };
};

const unavailable = () => problem(503, "Реквізити тимчасово недоступні", "Зберігання реквізитів ще не налаштоване. Спробуйте пізніше.");

export const GET = async () => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    const limited = await rateLimited("requisitesRead", user.id);
    if (limited) return limited;
    return Response.json(await forUser(await getOwnRequisites(user.id), user.email), { headers: HEADERS });
  } catch (error) {
    return error instanceof SecretBoxUnavailableError ? unavailable() : failure(error);
  }
};

export const PUT = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const limited = await rateLimited("requisitesWrite", user.id);
  if (limited) return limited;
  const checked = validateRequisites(await readJson(request));
  if (!checked.ok) return problem(400, "Реквізити не збережено", checked.error);
  if (!(await featureEnabledFor("crypto_proof", user.email)) && (checked.value.usdtTrc20 || checked.value.binanceId)) return problem(409, "Крипто-оплата недоступна", "Оплата USDT ще не відкрита для вашого акаунта.");
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
    return Response.json({ outcome, ...(await forUser(await getOwnRequisites(user.id), user.email)) }, { headers: HEADERS });
  } catch (error) {
    return error instanceof SecretBoxUnavailableError ? unavailable() : failure(error, request);
  }
};
