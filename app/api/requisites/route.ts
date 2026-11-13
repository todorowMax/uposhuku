// /api/requisites — власні реквізити виконавця для прямого переказу.
// GET — поточні значення й зміна, що чекає; PUT — зберегти (перше одразу, наступні з затримкою 24 години й листом).

import { problem, readJson } from "@/lib/api/problem";
import { validateRequisites, visibleRequisites, type Requisites } from "@/lib/deals/requisites";
import { getSessionUser } from "@/lib/server/auth";
import { walletConfigFor } from "@/lib/server/crypto-config";
import { featureEnabledFor } from "@/lib/server/features";
import { cryptoGate } from "@/lib/server/legal-gate";
import { sendRequisitesChangeNotice } from "@/lib/server/mail";
import { getOwnRequisites, saveOwnRequisites } from "@/lib/server/requisites-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";
import { logServer } from "@/lib/telemetry/log";

const HEADERS = { "cache-control": "no-store" };

/** Крипто-поля бачить і міняє лише той, кому ввімкнено `crypto_proof`, PayPal і Wise лише з `foreign_links`; адресу гаманця лише з увімкненою оплатою з гаманця. */
const forUser = async <T extends { requisites: Requisites | null; pending: { requisites: Requisites; mask: string; effectiveAt: number } | null }>(data: T, email: string): Promise<T & { crypto: boolean; wallet: boolean; foreign: boolean }> => {
  const crypto = await featureEnabledFor("crypto_proof", email);
  const wallet = (await walletConfigFor(email)) !== null;
  const foreign = await featureEnabledFor("foreign_links", email);
  const shown = (value: Requisites) => visibleRequisites(value, { crypto, wallet, foreign });
  return { ...data, crypto, wallet, foreign, requisites: data.requisites && shown(data.requisites), pending: data.pending && { ...data.pending, requisites: shown(data.pending.requisites) } };
};

/** USDT-адреса й Binance ID: потрібні прапорець `crypto_proof` і підтверджений ризик; null, якщо цих полів немає або все гаразд. */
const cryptoFieldsRefusal = async (user: { id: string; email: string }, value: Requisites): Promise<Response | null> => {
  if (!value.usdtTrc20 && !value.binanceId) return null;
  if (!(await featureEnabledFor("crypto_proof", user.email))) return problem(409, "Крипто-оплата недоступна", "Оплата USDT ще не відкрита для вашого акаунта.");
  return cryptoGate(user.id);
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
  const cryptoRefused = await cryptoFieldsRefusal(user, checked.value);
  if (cryptoRefused) return cryptoRefused;
  if (!(await featureEnabledFor("foreign_links", user.email)) && (checked.value.paypalUrl || checked.value.wiseUrl)) return problem(409, "PayPal і Wise недоступні", "Ці способи ще не відкриті для вашого акаунта.");
  try {
    // Адреса гаманця підтверджується лише підписом: з форми її не приймаємо, а раніше підтверджену зберігаємо.
    const own = await getOwnRequisites(user.id);
    const walletAddress = (own.pending?.requisites ?? own.requisites)?.walletAddress;
    const outcome = await saveOwnRequisites(user.id, { ...checked.value, ...(walletAddress ? { walletAddress } : {}) });
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
