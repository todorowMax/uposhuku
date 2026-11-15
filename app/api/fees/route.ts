// GET /api/fees — рахунок комісії за фактом поточної людини: баланс, строк, останні рядки журналу.
// Прапорець `postpaid_fee` вимкнений і журнал порожній: enabled=false без даних. Якщо прапорець вимкнули, а записи
// лишились, людина їх бачить і може сплатити борг.

import { problem } from "@/lib/api/problem";
import { feeAccount, hasFeeEntries } from "@/lib/server/fee-repo";
import { featureEnabledFor } from "@/lib/server/features";
import { route } from "@/lib/server/route";

export const GET = route({ auth: "user" }, async ({ user }) => {
  const enabled = await featureEnabledFor("postpaid_fee", user.email);
  if (!enabled && !(await hasFeeEntries(user.id))) {
    return Response.json({ enabled: false, balanceKop: 0, dueAt: null, entries: [] }, { headers: { "cache-control": "no-store" } });
  }
  const account = await feeAccount(user.id);
  return Response.json({ enabled, ...account }, { headers: { "cache-control": "no-store" } });
});
