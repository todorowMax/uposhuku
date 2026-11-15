// lib/requests/responses.ts
//
// Відгуки виконавців на запит замовника, зібрані в пропозиції: хто відповів,
// що запропонував і з яким рівнем розміщення. Усе з D1. Порядок — за оплатою
// розміщення (вищий рівень вище), серед рівних — хто відповів раніше.

import { CITIES } from "@/lib/map/cities";
import { isPromoted } from "@/lib/placement/tiers";
import { tiersFor } from "@/lib/server/placement-repo";
import { getProfiles } from "@/lib/server/profile-repo";
import { responsesTo } from "@/lib/server/request-repo";
import { reviewStatsFor } from "@/lib/server/review-repo";
import type { OfferResponse, PublishedRequest } from "./types";

export const responsesFor = async (request: PublishedRequest): Promise<OfferResponse[]> => {
  if (request.status !== "open") return [];
  const list = await responsesTo(request.id);
  if (list.length === 0) return [];
  // Усе пачками: профілі, рівні й оцінки для всіх відповідей разом, а не по запиту на кожну.
  const userIds = list.map(({ userId }) => userId);
  const [profiles, tiers, stats] = await Promise.all([getProfiles(userIds), tiersFor(userIds), reviewStatsFor(userIds.map((userId) => `me-${userId}`))]);
  const offers = list.map(({ userId, response, status }): OfferResponse | null => {
    const profile = profiles.get(userId);
    if (!profile?.published) return null;
    const tier = tiers.get(userId) ?? 1;
    const average = stats.get(`me-${userId}`)?.average;
    return {
      id: `resp_${request.id}_${userId}`,
      requestId: request.id,
      performerId: `me-${userId}`,
      name: profile.name,
      specialty: profile.specialty,
      cityName: CITIES.find((city) => city.id === profile.cityId)?.name ?? "",
      avatarIndex: 0,
      photo: profile.photo || undefined,
      tier,
      promoted: isPromoted(tier),
      rating: average ? average.toFixed(1) : "—",
      price: response.price,
      days: response.days,
      message: response.message,
      createdAt: response.createdAt,
      status,
    };
  });
  return offers.filter((offer): offer is OfferResponse => offer !== null).sort((a, b) => b.tier - a.tier || a.createdAt.localeCompare(b.createdAt));
};
