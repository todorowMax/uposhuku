// components/chat/inbox/parts/conversation-list.tsx
//
// Колонка зі списком розмов: заголовок, кнопки «розгорнути» й «закрити», фільтри, рядки розмов.

import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Maximize2, Minimize2, X } from "lucide-react";
import type { ConversationDto } from "@/lib/chat/types";
import { isUnread } from "@/lib/chat/unread";
import { EVENTS, track } from "@/lib/telemetry/track";
import type { InboxFilter } from "../use-inbox";
import type { InboxSize } from "../use-inbox-motion";

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
  onFilter,
  onOpen,
  onToggleSize,
  onClose,
}: {
  items: ConversationDto[];
  activeId: string | undefined;
  filter: InboxFilter;
  size: InboxSize;
  onFilter: (filter: InboxFilter) => void;
  onOpen: (item: ConversationDto) => void;
  onToggleSize: () => void;
  onClose: () => void;
}) => (
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
    <ul className="inbox-list">
      {items
        .filter((item) => filter === "all" || item.phase === filter)
        .map((item) => {
          const unread = isUnread(item);
          return (
            <li key={item.id}>
              <Button
                variant="bare"
                onClick={() => {
                  track(EVENTS.chatOpened, { from: "inbox" });
                  onOpen(item);
                }}
                className="inbox-row"
                data-active={activeId === item.id || undefined}
                data-unread={unread || undefined}
              >
                <span className="inbox-name flex items-center">
                  {item.other.name}
                  <em>{item.role === "performer" ? "замовник" : (item.other.specialty ?? "виконавець")}</em>
                  {item.unread > 0 && (
                    <span className="inbox-badge ml-auto">
                      <span className="sr-only">Непрочитаних: </span>
                      {item.unread}
                    </span>
                  )}
                </span>
                {item.offer && !item.deal && <span className="inbox-offer-tag">Відгук на «{item.offer.title}»</span>}
                {item.deal && (
                  <span className="inbox-deal-tag" data-action={item.deal.needsMe || undefined}>
                    <FileText aria-hidden className="size-3" strokeWidth={2} />
                    {item.deal.label}
                  </span>
                )}
                <span className="inbox-preview">{item.lastMessage ? item.lastMessage.text || "📷 Фото" : "Без повідомлень"}</span>
              </Button>
            </li>
          );
        })}
    </ul>
  </aside>
);
