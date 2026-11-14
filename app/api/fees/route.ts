// GET /api/fees — рахунок комісії за фактом поточної людини: баланс, строк, останні рядки журналу.
// Прапорець `postpaid_fee` вимкнений і журнал порожній: enabled=false без даних. Якщо прапорець вимкнули, а записи
// лишились, людина їх бачить і може сплатити борг.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { feeAccount, hasFeeEntries } from "@/lib/server/fee-repo";
import { featureEnabledFor } from "@/lib/server/features";

export const GET = async () => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const enabled = await featureEnabledFor("postpaid_fee", user.email);
  if (!enabled && !(await hasFeeEntries(user.id))) {
    return Response.json({ enabled: false, balanceKop: 0, dueAt: null, entries: [] }, { headers: { "cache-control": "no-store" } });
  }
  const account = await feeAccount(user.id, Date.now());
  return Response.json({ enabled, ...account }, { headers: { "cache-control": "no-store" } });
};
