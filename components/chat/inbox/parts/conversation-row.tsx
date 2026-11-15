"use client";

// components/chat/inbox/parts/conversation-row.tsx
//
// Рядок списку розмов: аватар, ім'я (або назва запиту), час, мітка угоди й превʼю останньої репліки людини.

import { FileText } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { listTime } from "@/lib/chat/dates";
import { conversationTitle, initialsOf, roleLabel } from "@/lib/chat/display";
import type { ConversationDto } from "@/lib/chat/types";
import { isUnread } from "@/lib/chat/unread";

/** Превʼю: остання репліка людини (свої з «Ви:»), а не службовий рядок; без реплік лише підказка. */
const previewOf = (item: ConversationDto): string => {
  const message = item.lastHumanMessage;
  if (!message) return "Ще немає повідомлень";
  const body = message.text || "📷 Фото";
  return message.from === item.role ? `Ви: ${body}` : body;
};

export const ConversationRow = ({ item, active, onOpen }: { item: ConversationDto; active: boolean; onOpen: () => void }) => {
  const title = conversationTitle(item);
  const unread = isUnread(item);
  return (
    <li>
      <Button variant="bare" onClick={onOpen} className="inbox-row" data-active={active || undefined} data-unread={unread || undefined}>
        <Avatar src={item.other.photo} initials={initialsOf(title)} className="inbox-avatar" />
        <span className="inbox-row-body">
          <span className="inbox-name flex items-center">
            <span className="truncate">{title}</span>
            <em>{roleLabel(item)}</em>
            {item.lastMessage && (
              <time className="inbox-time ml-auto" dateTime={item.lastMessage.at}>
                {listTime(item.lastMessage.at, new Date())}
              </time>
            )}
          </span>
          {item.offer && !item.deal && !item.other.nameless && <span className="inbox-offer-tag">Відгук на «{item.offer.title}»</span>}
          {item.deal && (
            <span className="inbox-deal-tag" data-action={item.deal.needsMe || undefined}>
              <FileText aria-hidden className="size-3" strokeWidth={2} />
              {item.deal.label}
            </span>
          )}
          <span className="flex items-center">
            <span className="inbox-preview">{previewOf(item)}</span>
            {item.unread > 0 && (
              <span className="inbox-badge ml-auto">
                <span className="sr-only">Непрочитаних: </span>
                {item.unread}
              </span>
            )}
          </span>
        </span>
      </Button>
    </li>
  );
};
