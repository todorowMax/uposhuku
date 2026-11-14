// /api/requests — запити замовника.
// POST — опублікувати (лише з сесією: гість спершу вводить код з пошти);
// GET — мої запити, нові першими.

import { rateLimited } from "@/lib/server/rate-limit";
import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { createRequest, listRequests } from "@/lib/server/request-repo";
import { parseDraft } from "@/lib/requests/parse-draft";
import { pushGlobal } from "@/lib/server/realtime";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";
import { recordUnknownTerms } from "@/lib/server/tag-term-repo";
import { telemetryConfig } from "@/lib/telemetry/server";
import { notifyMatchingPerformers } from "@/lib/server/notify-matching";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід", "Підтвердьте пошту, щоб опублікувати запит.");
  const limited = await rateLimited("requestCreate", user.id);
  if (limited) return limited;
  const draft = parseDraft(await readJson(request));
  if (typeof draft === "string") return problem(400, "Запит не заповнено", draft);
  const created = await createRequest(user.id, draft);
  // Слова, яких словник не знає, лічимо без зв'язку з людиною: звідти росте словник. Після відповіді, помилка не страшна.
  const counting = recordUnknownTerms(draft.text);
  if (telemetryConfig.waitUntil) telemetryConfig.waitUntil(counting);
  else void counting;
  notifyMatchingPerformers(created, user.id);
  serverEvent(EVENTS.requestPublished, { request_id: created.id, tags: created.tags.length, has_budget: Boolean(created.budget), remote: !created.cityId }, user.id, "/api/requests");
  pushGlobal({ t: "feed" });
  return Response.json({ request: created }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ requests: await listRequests(user.id) }, { headers: { "cache-control": "no-store" } });
}
