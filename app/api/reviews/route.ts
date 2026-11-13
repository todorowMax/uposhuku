// /api/reviews — відгуки про роботу.
// GET ?performerId= — відгуки виконавця (відкрито всім); GET ?dealId= — мій
// відгук по угоді; POST {dealId, stars, text} — лишити відгук після
// завершеної угоди, один на угоду. verified ставить сервер (lib/deals/verified.ts).

import { legalGate } from "@/lib/server/legal-gate";
import { rateLimited } from "@/lib/server/rate-limit";
import { problem, readJson } from "@/lib/api/problem";
import { getSessionUser } from "@/lib/server/auth";
import { isVerifiedDeal } from "@/lib/deals/verified";
import { listDealProofs } from "@/lib/server/crypto-proof-repo";
import { listDeals } from "@/lib/server/deal-repo";
import { addReview, reviewOfDeal, reviewsFor } from "@/lib/server/review-repo";
import { reviewAuthor } from "@/lib/reviews/author";
import { REVIEW_TEXT_MAX, averageStars } from "@/lib/reviews/types";
import { EVENTS } from "@/lib/telemetry/events";
import { serverEvent } from "@/lib/telemetry/log";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const dealId = params.get("dealId");
  if (dealId) {
    const user = await getSessionUser();
    if (!user) return problem(401, "Потрібен вхід");
    return Response.json({ review: (await reviewOfDeal(dealId)) ?? null }, { headers: { "cache-control": "no-store" } });
  }
  const performerId = params.get("performerId");
  if (!performerId) return problem(400, "Не вказано виконавця");
  const reviews = await reviewsFor(performerId.slice(0, 80));
  return Response.json({ reviews, average: averageStars(reviews) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return problem(401, "Потрібен вхід");
  const limited = await rateLimited("reviewCreate", user.id);
  if (limited) return limited;
  const legal = await legalGate(user.id);
  if (legal) return legal;
  const body = await readJson(request);
  const dealId = typeof body?.dealId === "string" ? body.dealId : "";
  const deal = (await listDeals(user.id)).find((item) => item.id === dealId);
  if (!deal) return problem(404, "Угоду не знайдено");
  if (deal.status !== "completed") return problem(409, "Відгук можна лишити після завершення угоди");
  if (await reviewOfDeal(dealId)) return problem(409, "Ви вже лишили відгук по цій угоді");
  const stars = typeof body?.stars === "number" ? Math.round(body.stars) : 0;
  if (stars < 1 || stars > 5) return problem(400, "Оберіть оцінку від 1 до 5");
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, REVIEW_TEXT_MAX) : "";
  const author = reviewAuthor(user.name);
  // Позначку «Перевірена угода» рахує лише сервер зі стану угоди й підтверджень оплати; з тіла запиту її не беремо.
  const verified = isVerifiedDeal(deal, await listDealProofs(dealId));
  const review = await addReview(user.id, { performerId: deal.performer.id, dealId, stars: stars as 1 | 2 | 3 | 4 | 5, text, author, verified }).catch(async (error: unknown) => {
    // Паралельний запит устиг раніше: унікальний індекс по угоді пропустив лише один, другому відповідаємо як на повтор.
    if (await reviewOfDeal(dealId)) return null;
    throw error;
  });
  if (!review) return problem(409, "Ви вже лишили відгук по цій угоді");
  serverEvent(EVENTS.reviewLeft, { deal_id: dealId, stars }, user.id, "/api/reviews");
  return Response.json({ review }, { status: 201 });
}
