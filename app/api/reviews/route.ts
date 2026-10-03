// /api/reviews — відгуки про роботу.
// GET ?performerId= — відгуки виконавця (відкрито всім); GET ?dealId= — мій
// відгук по угоді; POST {dealId, stars, text} — лишити відгук після
// завершеної угоди, один на угоду.

import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { listDeals } from "@/lib/deals/mock-store";
import { addReview, reviewOfDeal, reviewsFor } from "@/lib/reviews/mock-store";
import { REVIEW_TEXT_MAX, averageStars } from "@/lib/reviews/types";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const dealId = params.get("dealId");
  if (dealId) {
    const user = await getSessionUser();
    if (!user) return problem(401, "Потрібен вхід");
    return Response.json({ review: reviewOfDeal(dealId) ?? null }, { headers: { "cache-control": "no-store" } });
  }
  const performerId = params.get("performerId");
  if (!performerId) return problem(400, "Не вказано виконавця");
  const reviews = reviewsFor(performerId.slice(0, 80));
  return Response.json({ reviews, average: averageStars(reviews) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const body = await readJson(request);
  const dealId = typeof body?.dealId === "string" ? body.dealId : "";
  const deal = listDeals(user.id).find((item) => item.id === dealId);
  if (!deal) return problem(404, "Угоду не знайдено");
  if (deal.status !== "completed") return problem(409, "Відгук можна лишити після завершення угоди");
  if (reviewOfDeal(dealId)) return problem(409, "Ви вже лишили відгук по цій угоді");
  const stars = typeof body?.stars === "number" ? Math.round(body.stars) : 0;
  if (stars < 1 || stars > 5) return problem(400, "Оберіть оцінку від 1 до 5");
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, REVIEW_TEXT_MAX) : "";
  const author = (user.name ?? user.email.split("@")[0]).split(/\s+/)[0].slice(0, 30);
  return Response.json({ review: addReview({ performerId: deal.performer.id, dealId, stars: stars as 1 | 2 | 3 | 4 | 5, text, author }) }, { status: 201 });
}
