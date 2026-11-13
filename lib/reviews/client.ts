"use client";

import { ApiError, problemError } from "@/lib/auth/client";
import type { Review } from "./types";

const call = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      cache: "no-store",
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiError("Немає зв'язку. Перевірте інтернет і спробуйте ще раз.");
  }
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string; code?: string }) | null;
  if (!response.ok) throw problemError(data);
  return data as T;
};

export const fetchReviews = (performerId: string) =>
  call<{ reviews: Review[]; average: number | null }>(`/api/reviews?performerId=${encodeURIComponent(performerId)}`);

export const fetchMyReview = async (dealId: string) => (await call<{ review: Review | null }>(`/api/reviews?dealId=${encodeURIComponent(dealId)}`)).review;

export const sendReview = async (dealId: string, stars: number, text: string) =>
  (await call<{ review: Review }>("/api/reviews", { method: "POST", body: JSON.stringify({ dealId, stars, text }) })).review;
