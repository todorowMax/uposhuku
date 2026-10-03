// lib/requests/responses.ts
//
// Відгуки виконавців на запит замовника, зібрані в пропозиції: хто відповів,
// що запропонував і з яким рівнем розміщення. Усе з D1. Порядок — за оплатою
// розміщення (вищий рівень вище), серед рівних — хто відповів раніше.

import { CITIES } from "@/lib/map/cities";
import { isPromoted } from "@/lib/placement/tiers";
import { getPlacement } from "@/lib/server/placement-repo";
import { getProfile } from "@/lib/server/profile-repo";
import { responsesTo } from "@/lib/server/request-repo";
import { getReviewStats } from "@/lib/server/review-repo";
import type { OfferResponse, PublishedRequest } from "./types";

export const responsesFor = async (request: PublishedRequest): Promise<OfferResponse[]> => {
  if (request.status !== "open") return [];
  const offers = await Promise.all(
    (await responsesTo(request.id)).map(async ({ userId, response }): Promise<OfferResponse | null> => {
      const profile = await getProfile(userId);
      if (!profile?.published) return null;
      const [placement, stats] = await Promise.all([getPlacement(userId), getReviewStats(`me-${userId}`)]);
      return {
        id: `resp_${request.id}_${userId}`,
        requestId: request.id,
        performerId: `me-${userId}`,
        name: profile.name,
        specialty: profile.specialty,
        cityName: CITIES.find((city) => city.id === profile.cityId)?.name ?? "",
        avatarIndex: 0,
        photo: profile.photo || undefined,
        tier: placement.tier,
        promoted: isPromoted(placement.tier),
        rating: stats.average ? stats.average.toFixed(1) : "—",
        price: response.price,
        days: response.days,
        message: response.message,
        createdAt: response.createdAt,
      };
    }),
  );
  return offers.filter((offer): offer is OfferResponse => offer !== null).sort((a, b) => b.tier - a.tier || a.createdAt.localeCompare(b.createdAt));
};
