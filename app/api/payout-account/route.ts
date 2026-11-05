// /api/payout-account — підключення виконавця до виплат безпечної угоди (ФОП у monobank).
// GET — стан своєї заявки й чи доступна функція; PUT — подати заявку (ІПН шифрується, на екрані лише маска).
// Активацію робить адміністратор після звірки з банком, не цей маршрут.

import { problem, readJson } from "@/lib/api/problem";
import { validatePayoutApplication } from "@/lib/deals/payout";
import { getSessionUser } from "@/lib/server/auth";
import { getOwnPayout, submitPayout } from "@/lib/server/payout-repo";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { safeDealMode } from "@/lib/server/safe-deal";
import { SecretBoxUnavailableError } from "@/lib/server/secret-box";

const HEADERS = { "cache-control": "no-store" };

/** Форму виплат показуємо, поки безпечна угода не вимкнена зовсім. */
const available = () => safeDealMode() !== "off";

export const GET = async () => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  try {
    return Response.json({ available: available(), payout: available() ? await getOwnPayout(user.id) : null }, { headers: HEADERS });
  } catch (error) {
    return failure(error);
  }
};

export const PUT = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  if (!available()) return problem(409, "Виплати ще недоступні", "Безпечна угода ще не відкрита.");
  try {
    const limited = await rateLimited("payoutApply", user.id);
    if (limited) return limited;
    const checked = validatePayoutApplication(await readJson(request));
    if (!checked.ok) return problem(400, "Заявку не подано", checked.error);
    const outcome = await submitPayout(user.id, checked.value);
    if (outcome.kind === "already_active") return problem(409, "Виплати вже підключено", "Рахунок уже підключено. Щоб змінити його, напишіть у підтримку.");
    return Response.json({ available: true, payout: await getOwnPayout(user.id) }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof SecretBoxUnavailableError) return problem(503, "Підключення тимчасово недоступне", "Зберігання даних ще не налаштоване. Спробуйте пізніше.");
    return failure(error, request);
  }
};
