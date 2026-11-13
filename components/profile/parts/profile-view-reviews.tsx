"use client";

// Відгуки про виконавця на повному профілі: середня оцінка, перевірені угоди, список.

import { Loader2 } from "@/components/icons";
import { Stars } from "@/components/deals/stars";
import { VerifiedBadge } from "@/components/reviews/verified-badge";
import type { ProfileViewState } from "@/components/profile/use-profile-view";

export namespace ProfileViewReviewsTypes {
  export type Props = Pick<ProfileViewState, "reviews" | "stats">;
}

const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" });

const reviewsWord = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return "відгук";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "відгуки";
  return "відгуків";
};

export const ProfileViewReviews = ({ reviews, stats }: ProfileViewReviewsTypes.Props) => (
  <section className="pe-section" aria-labelledby="pv-reviews">
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
      <h2 id="pv-reviews" className="pe-title">
        Відгуки
      </h2>
      {reviews?.average && (
        <span className="inline-flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
          <Stars value={reviews.average} />
          <span className="font-semibold tabular-nums text-ink">{reviews.average.toFixed(1)}</span>· {reviews.list.length} {reviewsWord(reviews.list.length)}
          {stats && stats.verifiedReviews > 0 && ` · перевірених: ${stats.verifiedReviews}`}
        </span>
      )}
    </div>
    {!reviews && <Loader2 className="size-5 animate-spin text-ink-muted" />}
    {reviews && reviews.list.length === 0 && <p className="text-sm leading-relaxed text-ink-muted">Відгуків поки немає. Їх лишають замовники після завершеної угоди, тож накрутити неможливо.</p>}
    <ul className="grid gap-3">
      {reviews?.list.map((review) => (
        <li key={review.id} className="pv-review">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{review.author}</p>
            <time dateTime={review.createdAt} className="text-xs text-ink-muted">
              {DATE.format(new Date(review.createdAt))}
            </time>
          </div>
          <Stars value={review.stars} size={13} />
          {review.verified && <VerifiedBadge />}
          {review.text && <p className="mt-1.5 text-sm leading-snug text-ink/90">{review.text}</p>}
        </li>
      ))}
    </ul>
  </section>
);
