// components/chat/inbox/parts/message-list.tsx
//
// Стрічка розмови: дні, репліки, події угод, рішення модератора, стан завантаження й помилка зв'язку.

import { useMemo, type Ref } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatLine } from "@/lib/chat/client";
import { clockTime } from "@/lib/chat/dates";
import { buildFeed, resolveDealId } from "@/lib/chat/feed";
import { DayDivider, DealEvents, ModeratorCard, Pill } from "./feed-items";
import { LoadEarlier, type LoadEarlierTypes } from "./load-earlier";
import { MessageText } from "./message-text";

export namespace MessageListTypes {
  export type Props = {
    ref: Ref<HTMLDivElement>;
    lines: ChatLine[];
    /** Угоди розмови: за ними чип номера відкриває екран угоди. */
    deals: { id: string; number: string }[];
    loaded: boolean;
    error: boolean;
    empty: boolean;
    /** Живий регіон вмикається після першого завантаження, щоб історію не зачитували. */
    live: boolean;
    /** Старіші повідомлення на сервері: показати «Показати раніше» над стрічкою. */
    hasMore: boolean;
    earlier: LoadEarlierTypes.Props["state"];
    onLoadEarlier: () => void;
    unseen: boolean;
    onScroll: () => void;
    onJumpDown: () => void;
    onPhoto: (url: string) => void;
    onOpenDeal: (dealId: string) => void;
  };
}

export const MessageList = ({ ref, lines, deals, loaded, error, empty, live, hasMore, earlier, onLoadEarlier, unseen, onScroll, onJumpDown, onPhoto, onOpenDeal }: MessageListTypes.Props) => {
  const feed = useMemo(() => buildFeed(lines, new Date()), [lines]);
  const opener = (group: ChatLine[], number: string) => {
    const id = resolveDealId(group, number, deals);
    return id ? () => onOpenDeal(id) : undefined;
  };

  return (
    <div ref={ref} className="dm-scroll inbox-thread focus:outline-none" role="log" aria-label="Переписка" aria-live={live ? "polite" : "off"} tabIndex={-1} onScroll={onScroll}>
      {loaded && hasMore && <LoadEarlier state={earlier} onLoad={onLoadEarlier} />}
      {!loaded && lines.length === 0 && (
        <div className="inbox-loading" role="status" aria-label="Завантажуємо переписку">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {loaded && lines.length === 0 && empty && !error && (
        <p className="inbox-hint">Опишіть задачу: що потрібно зробити, строки й бюджет. Домовитесь тут, а коли всі умови зійдуться, оформите угоду.</p>
      )}
      {feed.map((item) => {
        if (item.type === "day") return <DayDivider key={item.key} label={item.label} />;
        if (item.type === "pill") return <Pill key={item.key} line={item.line} />;
        if (item.type === "deal") return <DealEvents key={item.key} number={item.number} lines={item.lines} onOpen={opener(item.lines, item.number)} />;
        if (item.type === "moderator") return <ModeratorCard key={item.key} line={item.line} decision={item.decision} onOpen={item.decision.number ? opener([item.line], item.decision.number) : undefined} />;
        const line = item.line;
        return (
          <div key={item.key} className="dm-bubble" data-from={line.from}>
            {line.photos && (
              <div className="dm-photos" data-count={line.photos.length}>
                {line.photos.map((url) => (
                  <Button key={url} variant="bare" className="dm-photo" aria-label="Відкрити фото" onClick={() => onPhoto(url)}>
                    <img src={url} alt="Фото з чату" loading="lazy" />
                  </Button>
                ))}
              </div>
            )}
            {line.text && <MessageText text={line.text} />}
            <time dateTime={line.at}>{clockTime(line.at)}</time>
          </div>
        );
      })}
      {error && <p className="dm-warn">Немає зв&apos;язку з сервером. Повідомлення підтягнуться, щойно він повернеться.</p>}
      {unseen && (
        <Button variant="bare" className="dm-new" onClick={onJumpDown}>
          <ArrowDown aria-hidden className="size-3.5" strokeWidth={2.4} />
          Нові повідомлення
        </Button>
      )}
    </div>
  );
};
