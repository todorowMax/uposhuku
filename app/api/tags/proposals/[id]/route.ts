// DELETE /api/tags/proposals/:id?context=&entityId= — прибрати свою пропозицію.

import { problem } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { removeProposalUse, type ProposalContext } from "@/lib/server/tag-proposal-repo";

const CONTEXTS: ProposalContext[] = ["profile", "work", "request"];

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const search = new URL(request.url).searchParams;
  const context = CONTEXTS.find((item) => item === search.get("context"));
  if (!context) return problem(400, "Невідомий контекст");
  await removeProposalUse(user.id, (await params).id, context, search.get("entityId") ?? "");
  return new Response(null, { status: 204 });
}
