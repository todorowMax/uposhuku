"use client";

// components/deals/deal-screen/use-review-form.ts
//
// Логіка відгуку про роботу: чи вже є мій відгук, вибір оцінки, надсилання.

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/auth/client";
import { fetchMyReview, sendReview } from "@/lib/reviews/client";
import type { Review } from "@/lib/reviews/types";
import { useAutoGrow } from "@/lib/ui/auto-grow";

export const useReviewForm = (dealId: string) => {
  const [existing, setExisting] = useState<Review | null | undefined>(undefined);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const textRef = useAutoGrow(text, 8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMyReview(dealId)
      .then((review) => !cancelled && setExisting(review))
      .catch(() => !cancelled && setExisting(null));
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  const submit = async () => {
    if (!stars) return setError("Оберіть оцінку.");
    setBusy(true);
    setError(null);
    try {
      setExisting(await sendReview(dealId, stars, text));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося надіслати відгук.");
    } finally {
      setBusy(false);
    }
  };

  return { existing, stars, setStars, shown: hover || stars, setHover, text, setText, textRef, busy, error, submit };
};
