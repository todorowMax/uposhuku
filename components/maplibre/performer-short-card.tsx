// components/maplibre/performer-short-card.tsx
//
// Коротка картка виконавця: хто це, чи онлайн, рейтинг, угоди, час на платформі. Одна на всіх:
// поповер над маркером (десктоп), прев'ю поруч зі списком групи і рядок у шторці (телефон).
// Без кнопок: дії стоять у тому, що її містить. Шапка з фото, далі три цифри рядком, як у профілі; підписи рахує lib/map/short-card.ts.

import { useTagLabels } from "@/components/maplibre/use-tag-labels";
import { avatarBackground } from "@/lib/map/avatar-style";
import { shortStats } from "@/lib/map/short-card";
import type { Performer } from "@/lib/map/types";
import { cn } from "@/lib/utils";

const MAX_TAGS = 3;
const STAT_NAMES = ["Рейтинг", "Угоди", "На платформі"] as const;

export namespace PerformerShortCardTypes {
  export interface Props extends Omit<React.ComponentProps<"div">, "children"> {
    performer: Performer;
    cityName?: string;
    /** Кнопки в самому низу картки (два стовпці), наприклад «Профіль» і «Написати». */
    actions?: React.ReactNode;
  }
}

export const PerformerShortCard = ({ performer, cityName, actions, className, ...props }: PerformerShortCardTypes.Props) => {
  const verified = performer.stats?.verifiedReviews ?? 0;
  const stats = shortStats(performer.stats);
  const tags = performer.tags.slice(0, MAX_TAGS);
  const tagLabel = useTagLabels(tags);
  return (
    <div className={cn("short-card", className)} {...props}>
      <div className="flex items-center gap-3">
        <span className="short-card-photo-wrap">
          <span aria-hidden className="short-card-photo" style={avatarBackground(performer)} />
          {performer.online && <span aria-hidden className="short-card-online" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{performer.name}</p>
          <p className="truncate text-xs text-ink-muted">{performer.specialty}</p>
          <p className="truncate text-xs text-ink-muted">
            {cityName && `${cityName} · `}
            {performer.online ? "Онлайн" : "Не в мережі"}
          </p>
        </div>
      </div>
      <dl className="short-card-stats grid grid-cols-3 divide-x divide-line text-center">
        {stats.map((stat, index) => (
          <div key={STAT_NAMES[index]} className="min-w-0 px-1">
            <dt className="sr-only">{STAT_NAMES[index]}</dt>
            <dd className="truncate text-base font-semibold text-ink">{stat.value}</dd>
            <dd className="mt-0.5 truncate text-xs text-ink-muted">{stat.label}</dd>
          </div>
        ))}
      </dl>
      {verified > 0 && <p className="short-card-verified text-xs">✓ Перевірених відгуків: {verified}</p>}
      {tags.length > 0 && (
        <div className="short-card-tags flex flex-wrap gap-1.5 text-xs text-ink-muted">
          {tags.map((tag) => (
            <span key={tag} className="short-card-tag">
              {tagLabel(tag)}
            </span>
          ))}
        </div>
      )}
      {actions && <div className="short-card-actions">{actions}</div>}
    </div>
  );
};
