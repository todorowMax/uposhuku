"use client";

// components/deals/deal-screen/parts/review-tsx
//
// Відгук замовника про завершену угоду: кнопка відкриває екран з оцінкою й текстом, далі «Дякуємо за відгук».

import { Check, Loader2, Star } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Screen } from "@/components/ui/screen";
import { Stars } from "@/components/deals/stars";
import { REVIEW_TEXT_MAX } from "@/lib/reviews/types";
import { useReviewForm } from "../use-review-form";

export const ReviewForm = ({ dealId, performerName }: { dealId: string; performerName: string }) => {
  const { existing, stars, setStars, shown, setHover, text, setText, textRef, busy, error, submit, open, setOpen } = useReviewForm(dealId);
  if (existing === undefined) return null;
  if (existing) {
    return (
      <div className="deal-box">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Check className="size-4" />
          Дякуємо за відгук
        </div>
        <Stars value={existing.stars} />
        {existing.text && <p className="mt-1.5 text-xs leading-snug text-ink">{existing.text}</p>}
        <p className="pe-hint mt-1.5">Його побачать інші замовники в профілі виконавця.</p>
      </div>
    );
  }
  return (
    <>
      <div className="deal-box">
        <p className="text-sm font-semibold text-ink">Як пройшла робота?</p>
        <p className="pe-hint">Оцінка й відгук потрапляють у профіль {performerName}.</p>
        <Button variant="secondary" onClick={() => setOpen(true)} className="mt-2 w-auto px-4">
          Залишити відгук
        </Button>
      </div>
      <Screen
        open={open}
        onOpenChange={setOpen}
        title="Відгук про роботу"
        desktop="panel"
        footer={
          <Button variant="offer" disabled={busy} onClick={() => void submit()} className="w-full">
            {busy && <Loader2 className="size-4 animate-spin" />}
            Надіслати відгук
          </Button>
        }
      >
        <div className="deal">
          <p className="pe-hint">Оцінка й відгук потрапляють у профіль {performerName}. Їх бачать усі замовники.</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Оцінка">
            {[1, 2, 3, 4, 5].map((value) => (
              <Button
                key={value}
                variant="bare"
                role="radio"
                aria-checked={stars === value}
                aria-label={`${value} з 5`}
                onMouseEnter={() => setHover(value)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setStars(value)}
                className="deal-star"
                data-on={value <= shown || undefined}
              >
                <Star className="size-6" />
              </Button>
            ))}
          </div>
          <label htmlFor={`review-${dealId}`} className="sr-only">
            Відгук
          </label>
          <Textarea
            id={`review-${dealId}`}
            ref={textRef}
            value={text}
            maxLength={REVIEW_TEXT_MAX}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            placeholder="Що сподобалось, що можна покращити (необов'язково)"
            className="resize-y"
          />
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
        </div>
      </Screen>
    </>
  );
};
