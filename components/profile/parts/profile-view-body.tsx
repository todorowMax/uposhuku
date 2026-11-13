"use client";

// Профіль виконавця без відгуків: шапка, цифри, «Про себе» з роботами, теги.

import { Check, MapPin } from "@/components/icons";
import { PerformerAbout } from "@/components/maplibre/performer-about";
import type { ProfileViewState } from "@/components/profile/use-profile-view";
import { avatarBackground } from "@/lib/map/avatar-style";
import type { Performer } from "@/lib/map/types";
import { TIER_NAMES, isPromoted } from "@/lib/placement/tiers";

export namespace ProfileViewBodyTypes {
  export type Props = Pick<ProfileViewState, "reviews" | "stats" | "city" | "labels" | "tags" | "proven"> & { performer: Performer };
}

export const ProfileViewBody = ({ performer, reviews, stats, city, labels, tags, proven }: ProfileViewBodyTypes.Props) => (
  <>
    <section className="pe-section pv-head">
      <div className="pv-photo" role="img" aria-label={`Фото ${performer.name}`} style={avatarBackground(performer)} />
      <div className="min-w-0 flex-1">
        <p className="text-xl font-semibold leading-tight text-ink">{performer.name}</p>
        <p className="mt-1 text-sm text-ink-muted">{performer.specialty}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {city}
            </span>
          )}
          {isPromoted(performer.tier) && <span className="offer-promoted">Просування</span>}
          <span>Розміщення: {TIER_NAMES[performer.tier]}</span>
        </div>
      </div>
    </section>

    <section className="pe-section" aria-label="Цифри">
      <div className="grid grid-cols-3 divide-x divide-line text-center">
        <div>
          <p className="text-lg font-semibold text-ink">{stats?.months} міс.</p>
          <p className="mt-0.5 text-xs text-ink-muted">на платформі</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-ink">{stats?.orders}</p>
          <p className="mt-0.5 text-xs text-ink-muted">замовлень</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-ink">{reviews?.average ? `★ ${reviews.average}` : `★ ${stats?.rating}`}</p>
          <p className="mt-0.5 text-xs text-ink-muted">рейтинг</p>
        </div>
      </div>
    </section>

    <section className="pe-section">
      <PerformerAbout performer={performer} onOpenWork={() => {}} full />
      {!performer.bio && performer.works.length === 0 && <p className="text-sm text-ink-muted">Виконавець ще не додав опис і роботи.</p>}
    </section>

    {tags.length > 0 && (
      <section className="pe-section" aria-labelledby="pv-tags">
        <h2 id="pv-tags" className="pe-title">
          Теги
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="auth-draft-tag">
              {proven.has(tag) && <Check className="mr-1 size-3 text-brand" aria-label="Підтверджено роботою" />}
              {labels[tag] ?? tag}
            </span>
          ))}
        </div>
        {proven.size > 0 && <p className="pe-hint">Галочка стоїть біля тегів, які підтверджує робота в портфоліо.</p>}
      </section>
    )}
  </>
);
