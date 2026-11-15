import { formatDate, reviewsWord } from "@/components/profile-page/utils";
import type { PublicProfile } from "@/lib/profile/public";

export namespace ProfilePageReviewsTypes {
  export type Props = Pick<PublicProfile, "reviews" | "average">;
}

/** Відгуки: оцінка словами й цифрою, не лише зірками; відгук із «Перевіреною угодою» позначений текстом. */
export const ProfilePageReviews = ({ reviews, average }: ProfilePageReviewsTypes.Props) => (
  <section aria-labelledby="pp-reviews" className="grid gap-3">
    <h2 id="pp-reviews" className="text-xl font-semibold text-ink">
      Відгуки
    </h2>
    {average !== null && (
      <p className="text-sm text-ink-muted">
        Середня оцінка {average.toFixed(1)} з 5 · {reviews.length} {reviewsWord(reviews.length)}
      </p>
    )}
    {reviews.length === 0 ? (
      <p className="text-sm leading-relaxed text-ink-muted">
        Відгуків поки немає. Їх лишають замовники після завершеної угоди.
      </p>
    ) : (
      <ul className="grid gap-3">
        {reviews.map((review) => (
          <li key={review.id} className="grid gap-1 rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{review.author}</p>
              <time dateTime={review.createdAt} className="text-xs text-ink-muted">
                {formatDate(review.createdAt)}
              </time>
            </div>
            <p className="text-sm text-ink">Оцінка {review.stars} з 5</p>
            {review.verified && <p className="text-xs font-semibold text-ink">Перевірена угода</p>}
            {review.text && <p className="text-sm leading-relaxed text-ink break-words">{review.text}</p>}
          </li>
        ))}
      </ul>
    )}
  </section>
);
