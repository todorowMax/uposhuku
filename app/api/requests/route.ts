// /api/requests — запити замовника.
// POST — опублікувати (лише з сесією: гість спершу вводить код з пошти);
// GET — мої запити, нові першими.

import { problem, readJson } from "@/lib/api/problem";
import { createRequest, listRequests, responseCounts } from "@/lib/server/request-repo";
import { parseDraft } from "@/lib/requests/parse-draft";
import { phoneGate } from "@/lib/server/phone-gate";
import { pushGlobal } from "@/lib/server/realtime";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";
import { recordUnknownTerms } from "@/lib/server/tag-term-repo";
import { telemetryConfig } from "@/lib/telemetry/server";
import { notifyMatchingPerformers } from "@/lib/server/notify-matching";
import { route } from "@/lib/server/route";

export const POST = route({ auth: "user", rate: "requestCreate", unauthorized: () => problem(401, "Потрібен вхід", "Підтвердьте пошту, щоб опублікувати запит.") }, async ({ request, user }) => {
  const phone = await phoneGate(user);
  if (phone) return phone;
  const draft = parseDraft(await readJson(request), { now: new Date() });
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
});

export const GET = route({ auth: "user" }, async ({ user }) => {
  const list = await listRequests(user.id);
  // Лічильники відгуків для «Моїх запитів»: клієнту не треба питати /responses по кожному запиту окремо.
  const counts = await responseCounts(list.filter((item) => item.status === "open").map((item) => item.id));
  return Response.json({ requests: list, responseCounts: Object.fromEntries(counts) }, { headers: { "cache-control": "no-store" } });
});
