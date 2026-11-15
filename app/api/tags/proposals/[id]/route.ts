// DELETE /api/tags/proposals/:id?context=&entityId= — прибрати свою пропозицію.

import { problem } from "@/lib/api/problem";
import { removeProposalUse, type ProposalContext } from "@/lib/server/tag-proposal-repo";
import { route } from "@/lib/server/route";

const CONTEXTS: ProposalContext[] = ["profile", "work", "request"];

export const DELETE = route<"user", undefined, { id: string }>({ auth: "user" }, async ({ request, user, params }) => {
  const search = new URL(request.url).searchParams;
  const context = CONTEXTS.find((item) => item === search.get("context"));
  if (!context) return problem(400, "Невідомий контекст");
  await removeProposalUse(user.id, params.id, context, search.get("entityId") ?? "");
  return new Response(null, { status: 204 });
});
