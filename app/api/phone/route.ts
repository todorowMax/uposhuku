// GET /api/phone — стан телефона замовника: чи потрібен (прапорець увімкнений для людини і номера немає), чи підтверджено, маска.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { isPhoneRequired, phoneStatus } from "@/lib/server/phone-repo";

export const GET = async () => {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const [required, status] = await Promise.all([isPhoneRequired(user), phoneStatus(user.id)]);
  return Response.json({ required, ...status }, { headers: { "cache-control": "no-store" } });
};
