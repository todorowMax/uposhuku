// /api/requests — запити замовника.
// POST — опублікувати (лише з сесією: гість спершу вводить код з пошти);
// GET — мої запити, нові першими.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { createRequest, listRequests } from "@/lib/requests/mock-store";
import { CITIES } from "@/lib/map/cities";
import { REQUEST_TEXT_MAX, REQUEST_TEXT_MIN, isDeadline, type RequestDraft } from "@/lib/requests/types";

const MAX_TAGS = 30;
const MAX_FILES = 10;

/** Лише очікувані поля й розумні межі: тіло приходить від клієнта як є. */
const parseDraft = (body: Record<string, unknown> | null): RequestDraft | string => {
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < REQUEST_TEXT_MIN) return "Опишіть, що потрібно зробити.";
  if (text.length > REQUEST_TEXT_MAX) return `Опис задовгий: до ${REQUEST_TEXT_MAX} символів.`;
  const tags = Array.isArray(body?.tags) ? body.tags : [];
  const files = Array.isArray(body?.files) ? body.files : [];
  const budget = typeof body?.budget === "number" && Number.isFinite(body.budget) && body.budget >= 100 && body.budget <= 10_000_000 ? Math.round(body.budget) : null;
  const cityId = typeof body?.cityId === "string" && CITIES.some((city) => city.id === body.cityId) ? body.cityId : null;
  return {
    text,
    budget,
    deadline: isDeadline(body?.deadline) ? body.deadline : null,
    cityId,
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
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід", "Підтвердьте пошту, щоб опублікувати запит.");
  const draft = parseDraft(await readJson(request));
  if (typeof draft === "string") return problem(400, "Запит не заповнено", draft);
  return Response.json({ request: createRequest(user.id, draft) }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  return Response.json({ requests: listRequests(user.id) }, { headers: { "cache-control": "no-store" } });
}
