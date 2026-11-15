// components/maplibre/performer-short-card.tsx
//
// Коротка картка виконавця: хто це, чи онлайн, рейтинг, угоди, час на платформі. Одна на всіх:
// поповер над маркером (десктоп), прев'ю поруч зі списком групи і рядок у шторці (телефон).
// Без кнопок: дії стоять у тому, що її містить. Підписи рахує lib/map/short-card.ts.

import { useTagLabels } from "@/components/maplibre/use-tag-labels";
import { avatarBackground } from "@/lib/map/avatar-style";
import { shortFacts } from "@/lib/map/short-card";
import type { Performer } from "@/lib/map/types";
import { cn } from "@/lib/utils";

const MAX_TAGS = 3;

export namespace PerformerShortCardTypes {
  export interface Props extends Omit<React.ComponentProps<"div">, "children"> {
    performer: Performer;
    cityName?: string;
  }
}

export const PerformerShortCard = ({ performer, cityName, className, ...props }: PerformerShortCardTypes.Props) => {
  const facts = shortFacts(performer.stats);
  const tags = performer.tags.slice(0, MAX_TAGS);
  const tagLabel = useTagLabels(tags);
  return (
    <div className={cn("short-card", className)} {...props}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="short-card-photo" style={avatarBackground(performer)} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{performer.name}</p>
          <p className="truncate text-xs text-ink-muted">{performer.specialty}</p>
          <p className="short-card-status text-xs text-ink-muted" data-online={performer.online || undefined}>
            <span aria-hidden className="short-card-dot" />
            {performer.online ? "Онлайн" : "Не в мережі"}
          </p>
        </div>
      </div>
      <dl className="short-card-facts text-xs text-ink">
        <div>
          <dt className="sr-only">Відгуки</dt>
          <dd className="font-semibold">{facts.reviewsLine}</dd>
          {facts.verifiedLine && <dd className="text-ink-muted">{facts.verifiedLine}</dd>}
        </div>
        <div>
          <dt className="sr-only">Угоди</dt>
          <dd>{facts.dealsLine}</dd>
        </div>
        <div>
          <dt className="sr-only">На платформі</dt>
          <dd>{facts.platformLine}</dd>
        </div>
      </dl>
      {(cityName || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          {cityName && <span>{cityName}</span>}
          {tags.map((tag) => (
            <span key={tag} className="short-card-tag">
              {tagLabel(tag)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
