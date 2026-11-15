// lib/profile/public.ts
//
// Публічний профіль для серверної сторінки /p/<id>: явний список полів, без пошти, id користувача, точних координат і
// службових даних. Усе, що тут є, і так видно кожному на карті чи в профілі. Фото віддаємо лише адресою /api/uploads/…:
// data URL у HTML не вставляємо.

import { cityById } from "@/lib/map/cities";
import type { PerformerStats } from "@/lib/map/types";
import type { Profile } from "@/lib/profile/types";
import { profileTags } from "@/lib/profile/types";
import type { Review } from "@/lib/reviews/types";
import { averageStars } from "@/lib/reviews/types";
import { tagLabel } from "@/lib/tags/engine";

export interface PublicProfileWork {
  id: string;
  title: string;
  description: string;
  url: string | null;
  tags: string[];
}

export interface PublicProfileReview {
  id: string;
  stars: number;
  text: string;
  author: string;
  verified: boolean;
  createdAt: string;
}

export interface PublicProfile {
  /** `me-<userId>`: той самий id, що в адресі й на карті. */
  id: string;
  name: string;
  specialty: string;
  cityId: string;
  city: string;
  bio: string;
  tags: { id: string; label: string }[];
  works: PublicProfileWork[];
  /** Адреса фото на нашому сховищі; `null`, коли фото немає або воно ще data URL (тоді малюємо ініціали). */
  photoUrl: string | null;
  stats: PerformerStats;
  reviews: PublicProfileReview[];
  /** Середня з усіх відгуків для підпису на сторінці. */
  average: number | null;
  /** Рейтинг лише з перевірених відгуків для розмітки: `null`, коли таких немає. */
  verifiedRating: { value: number; count: number } | null;
}

/** Фото, яке можна вставити адресою: лише наше сховище. Старі data URL у HTML не потрапляють. */
export const publicPhotoUrl = (photo: string): string | null => (photo.startsWith("/api/uploads/") ? photo : null);

export const verifiedRatingOf = (reviews: Pick<Review, "stars" | "verified">[]): PublicProfile["verifiedRating"] => {
  const verified = reviews.filter((review) => review.verified);
  const value = averageStars(verified);
  return value === null ? null : { value, count: verified.length };
};

export const toPublicProfile = ({
  profile,
  userId,
  reviews,
  stats,
}: {
  profile: Profile;
  userId: string;
  reviews: Review[];
  stats: PerformerStats;
}): PublicProfile => ({
  id: `me-${userId}`,
  name: profile.name.trim(),
  specialty: profile.specialty.trim(),
  cityId: profile.cityId,
  city: cityById(profile.cityId).name,
  bio: profile.bio.trim(),
  tags: profileTags(profile).map((id) => ({ id, label: tagLabel(id) })),
  works: profile.works.map((work) => ({
    id: work.id,
    title: work.title.trim() || "Без назви",
    description: work.description.trim(),
    url: work.url.trim() || null,
    tags: work.tags,
  })),
  photoUrl: publicPhotoUrl(profile.photo),
  stats,
  reviews: reviews.map((review) => ({
    id: review.id,
    stars: review.stars,
    text: review.text,
    author: review.author,
    verified: review.verified,
    createdAt: review.createdAt,
  })),
  average: averageStars(reviews),
  verifiedRating: verifiedRatingOf(reviews),
});
