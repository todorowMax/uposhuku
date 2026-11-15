import Image from "next/image";
import Link from "next/link";
import { ProfilePageReviews } from "@/components/profile-page/parts/profile-page-reviews";
import { ProfilePageWorks } from "@/components/profile-page/parts/profile-page-works";
import { initialsOf } from "@/components/profile-page/utils";
import { SiteShell, pageLinkClass } from "@/components/site-page/site-shell";
import type { PublicProfile } from "@/lib/profile/public";
import { catalogPath } from "@/lib/seo/catalog";

export namespace ProfilePageViewTypes {
  export type Props = { profile: PublicProfile };
}

const MONTHS = (count: number) => (count < 1 ? "менше місяця" : `${count} міс.`);

/**
 * Публічна сторінка виконавця для прямого заходу й пошуку: `h1` з іменем, спеціальність, місто, опис, теги (посилання на
 * каталог), роботи й відгуки. Рендериться на сервері без карти й MapLibre. Із самої карти профіль відкривається
 * вікном поверх неї (app/(map)/@modal/(.)p/[id]).
 */
export const ProfilePageView = ({ profile }: ProfilePageViewTypes.Props) => (
  <SiteShell skipLabel="Перейти до профілю">
    <article className="grid gap-6">
      <header className="flex items-start gap-4">
        {profile.photoUrl ? (
          // Лише наше сховище (/api/uploads/…); data URL у HTML не вставляємо.
          <Image src={profile.photoUrl} alt="" width={96} height={96} unoptimized className="size-24 shrink-0 rounded-xl object-cover" />
        ) : (
          <div aria-hidden="true" className="grid size-24 shrink-0 place-items-center rounded-xl bg-hover-blue text-2xl font-semibold text-ink">
            {initialsOf(profile.name)}
          </div>
        )}
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl font-semibold leading-tight text-ink break-words">{profile.name}</h1>
          <p className="text-base text-ink break-words">{profile.specialty}</p>
          <p className="text-sm text-ink-muted">{profile.city}</p>
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-4">
        <div className="grid gap-1">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Угод</dt>
          <dd className="text-base text-ink">{profile.stats.orders}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">На сайті</dt>
          <dd className="text-base text-ink">{MONTHS(profile.stats.months)}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Рейтинг</dt>
          <dd className="text-base text-ink">{profile.average === null ? "Ще немає" : `${profile.average.toFixed(1)} з 5`}</dd>
        </div>
      </dl>

      <p>
        <Link href="/" className="auth-primary w-full px-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto">
          Описати задачу на карті
        </Link>
      </p>

      {profile.bio && (
        <section aria-labelledby="pp-about" className="grid gap-2">
          <h2 id="pp-about" className="text-xl font-semibold text-ink">
            Про себе
          </h2>
          <p className="whitespace-pre-line text-base leading-relaxed text-ink break-words">{profile.bio}</p>
        </section>
      )}

      {profile.tags.length > 0 && (
        <section aria-labelledby="pp-tags" className="grid gap-2">
          <h2 id="pp-tags" className="text-xl font-semibold text-ink">
            Навички
          </h2>
          <ul className="flex flex-wrap gap-2">
            {profile.tags.map((tag) => (
              <li key={tag.id}>
                <Link href={catalogPath(tag.id, profile.cityId)} className={`inline-block rounded-xl bg-hover-blue px-3 py-1 text-sm ${pageLinkClass}`}>
                  {tag.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProfilePageWorks works={profile.works} />
      <ProfilePageReviews reviews={profile.reviews} average={profile.average} />
    </article>
  </SiteShell>
);
