// /api/requests — запити замовника.
// POST — опублікувати (лише з сесією: гість спершу вводить код з пошти);
// GET — мої запити, нові першими.

import { problem, readJson } from "@/lib/api/problem";
import { readMockSession } from "@/lib/auth/mock-session";
import { createRequest, listRequests } from "@/lib/requests/mock-store";
import { REQUEST_TEXT_MAX, REQUEST_TEXT_MIN, type RequestDraft } from "@/lib/requests/types";

const MAX_TAGS = 30;
const MAX_FILES = 10;

/** Лише очікувані поля й розумні межі: тіло приходить від клієнта як є. */
const parseDraft = (body: Record<string, unknown> | null): RequestDraft | string => {
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < REQUEST_TEXT_MIN) return "Опишіть, що потрібно зробити.";
  if (text.length > REQUEST_TEXT_MAX) return `Опис задовгий: до ${REQUEST_TEXT_MAX} символів.`;
  const tags = Array.isArray(body?.tags) ? body.tags : [];
  const files = Array.isArray(body?.files) ? body.files : [];
  return {
    text,
    tags: tags
      .filter((tag): tag is { id: string; label: string } => typeof tag?.id === "string" && typeof tag?.label === "string")
      .slice(0, MAX_TAGS)
      .map(({ id, label }) => ({ id: id.slice(0, 64), label: label.slice(0, 80) })),
    files: files
      .filter((file): file is { name: string; size: number; type: string } => typeof file?.name === "string" && typeof file?.size === "number")
      .slice(0, MAX_FILES)
      .map(({ name, size, type }) => ({ name: name.slice(0, 200), size, type: typeof type === "string" ? type.slice(0, 100) : "" })),
  };
};

export async function POST(request: Request) {
  const user = await readMockSession();
  if (!user) return problem(401, "Потрібен вхід", "Підтвердьте пошту, щоб опублікувати запит.");
  const draft = parseDraft(await readJson(request));
  if (typeof draft === "string") return problem(400, "Запит не заповнено", draft);
  return Response.json({ request: createRequest(user.id, draft) }, { status: 201 });
}

export async function GET() {
  const user = await readMockSession();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ requests: listRequests(user.id) }, { headers: { "cache-control": "no-store" } });
}
