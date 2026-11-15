// components/chat/inbox/parts/conversation-list.tsx
//
// Колонка зі списком розмов: заголовок, кнопки «розгорнути» й «закрити», фільтри, рядки розмов.

import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, X } from "lucide-react";
import type { ConversationDto } from "@/lib/chat/types";
import { EVENTS, track } from "@/lib/telemetry/track";
import type { InboxFilter } from "../use-inbox";
import type { InboxSize } from "../use-inbox-motion";
import { ConversationRow } from "./conversation-row";

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "Усі" },
  { id: "chat", label: "Чати" },
  { id: "deal", label: "Угоди" },
  { id: "done", label: "Завершені" },
];

export const ConversationList = ({
  items,
  activeId,
  filter,
  size,
  error,
  onRetry,
  onFilter,
  onOpen,
  onToggleSize,
  onClose,
}: {
  items: ConversationDto[];
  activeId: string | undefined;
  filter: InboxFilter;
  size: InboxSize;
  /** Останнє оновлення списку не вдалось. */
  error: boolean;
  onRetry: () => void;
  onFilter: (filter: InboxFilter) => void;
  onOpen: (item: ConversationDto) => void;
  onToggleSize: () => void;
  onClose: () => void;
}) => {
  const visible = items.filter((item) => filter === "all" || item.phase === filter);
  return (
    <aside className="inbox-side">
      <header className="inbox-header">
        <DialogTitle asChild>
          <h2>Повідомлення</h2>
        </DialogTitle>
        <Button
          variant="bare"
          onClick={onToggleSize}
          aria-label={size === "wide" ? "Згорнути вікно" : "Розгорнути вікно"}
          aria-pressed={size === "wide"}
          className="dr-close inbox-expand"
        >
          {size === "wide" ? <Minimize2 className="size-4" strokeWidth={2} /> : <Maximize2 className="size-4" strokeWidth={2} />}
        </Button>
        <Button variant="bare" onClick={onClose} aria-label="Закрити" className="dr-close inbox-close-list">
          <X className="size-4" strokeWidth={2.2} />
        </Button>
      </header>
      <div className="inbox-filters" role="group" aria-label="Розмови">
        {FILTERS.filter((entry) => entry.id === "all" || items.some((item) => item.phase === entry.id)).map((entry) => (
          <Button key={entry.id} variant="bare" aria-pressed={filter === entry.id} onClick={() => onFilter(entry.id)} className="inbox-filter">
            {entry.label}
            <span>{entry.id === "all" ? items.length : items.filter((item) => item.phase === entry.id).length}</span>
          </Button>
        ))}
      </div>
      {error && (
        <p className="dm-warn inbox-list-error" role="alert">
          Не вдалося оновити розмови.
          <Button variant="link" className="text-sm" onClick={onRetry}>
            Спробувати ще раз
          </Button>
        </p>
      )}
      {visible.length === 0 && items.length > 0 && <p className="inbox-list-note">У цьому розділі розмов немає</p>}
      <ul className="inbox-list">
        {visible.map((item) => (
          <ConversationRow
            key={item.id}
            item={item}
            active={activeId === item.id}
            onOpen={() => {
              track(EVENTS.chatOpened, { from: "inbox" });
              onOpen(item);
            }}
          />
        ))}
      </ul>
    </aside>
  );
};
