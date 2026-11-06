// lib/server/deal-access.ts
//
// Чи є людина стороною угоди (замовник або виконавець-акаунт). Чужому угода «не знайдена».

import { performerIdOf } from "@/lib/deals/parties";
import type { Deal } from "@/lib/deals/types";
import { getDealById, ownerOfDeal } from "./deal-repo";

export const dealForParty = async (dealId: string, userId: string): Promise<Deal | null> => {
  const deal = await getDealById(dealId);
  if (!deal) return null;
  if (deal.performer.id === performerIdOf(userId)) return deal;
  return (await ownerOfDeal(dealId)) === userId ? deal : null;
};
