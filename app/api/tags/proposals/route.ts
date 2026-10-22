// /api/tags/proposals — теги, яких немає у словнику.
// GET — мої пропозиції, що на розгляді; POST {text, context, entityId?} — запропонувати.
// Якщо такий тег уже є, відповідаємо {existing: tagId}: клієнт просто додає його.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { listPendingProposals, proposeTag, type ProposalContext } from "@/lib/server/tag-proposal-repo";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";

const CONTEXTS: ProposalContext[] = ["profile", "work", "request"];

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ proposals: await listPendingProposals(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід", "Увійдіть, щоб запропонувати тег.");
  const body = await readJson(request);
  const context = CONTEXTS.find((item) => item === body?.context);
  if (!context) return problem(400, "Тег не запропоновано", "Невідомий контекст.");
  const result = await proposeTag(user.id, { text: body?.text, context, entityId: typeof body?.entityId === "string" ? body.entityId : "" });
  if (result.kind === "invalid") return problem(400, "Тег не запропоновано", result.message);
  if (result.kind === "limit") return problem(429, "Забагато пропозицій за день", "Ви вже запропонували 10 тегів за добу. Спробуйте завтра.");
  if (result.kind === "existing") return Response.json({ existing: result.tagId });
  serverEvent(EVENTS.tagProposed, { context }, user.id, "/api/tags/proposals");
  return Response.json({ proposal: result.proposal }, { status: 201 });
}
