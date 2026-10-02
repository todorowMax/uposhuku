// lib/requests/format.ts
//
// Умови запиту словами для чипів: «до 15 000 ₴», «Протягом тижня», «Львів».

import { CITIES } from "@/lib/map/cities";
import { DEADLINES, type RequestDraft } from "./types";

const PRICE = new Intl.NumberFormat("uk-UA");

export const requestFacts = (request: Pick<RequestDraft, "budget" | "deadline" | "cityId">): string[] => [
  ...(request.budget ? [`до ${PRICE.format(request.budget)} ₴`] : []),
  ...(request.deadline ? [DEADLINES[request.deadline]] : []),
  ...(request.cityId ? [CITIES.find((city) => city.id === request.cityId)?.name ?? "Україна"] : []),
];
