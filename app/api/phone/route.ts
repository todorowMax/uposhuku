// GET /api/phone — стан телефона замовника: чи потрібен (прапорець увімкнений для людини і номера немає), чи підтверджено, маска.

import { problem } from "@/lib/api/problem";
import { isPhoneRequired, phoneStatus } from "@/lib/server/phone-repo";
import { route } from "@/lib/server/route";

export const GET = route({ auth: "user" }, async ({ user }) => {
  const [required, status] = await Promise.all([isPhoneRequired(user), phoneStatus(user.id)]);
  return Response.json({ required, ...status }, { headers: { "cache-control": "no-store" } });
});
