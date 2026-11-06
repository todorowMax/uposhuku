// components/chat/inbox/parts/thread-header.tsx
//
// Шапка розмови: «←» до списку, ім'я і статус, «розгорнути» (лише від 768 px) та «закрити».

import { ArrowLeft, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConversationDto } from "@/lib/chat/types";
import type { InboxSize } from "../use-inbox-motion";

const statusText = (conversation: ConversationDto, typing: boolean): string => {
  if (typing) return "друкує…";
  return conversation.role === "performer" ? "замовник" : (conversation.other.specialty ?? "виконавець");
};

export const ThreadHeader = ({
  conversation,
  typing,
  size,
  onBack,
  onToggleSize,
  onClose,
}: {
  conversation: ConversationDto;
  typing: boolean;
  size: InboxSize;
  onBack: () => void;
  onToggleSize: () => void;
  onClose: () => void;
}) => (
  <header className="inbox-header">
    <Button variant="bare" onClick={onBack} aria-label="До списку" className="dr-close inbox-back">
      <ArrowLeft className="size-4" strokeWidth={2.2} />
    </Button>
    <div className="min-w-0 flex-1">
      <h2 className="truncate">{conversation.other.name}</h2>
      <p className="truncate text-xs leading-tight text-ink-muted">{statusText(conversation, typing)}</p>
    </div>
    <Button
      variant="bare"
      onClick={onToggleSize}
      aria-label={size === "wide" ? "Згорнути вікно" : "Розгорнути вікно"}
      aria-pressed={size === "wide"}
      className="dr-close inbox-expand"
    >
      {size === "wide" ? <Minimize2 className="size-4" strokeWidth={2} /> : <Maximize2 className="size-4" strokeWidth={2} />}
    </Button>
    <Button variant="bare" onClick={onClose} aria-label="Закрити" className="dr-close inbox-close-thread">
      <X className="size-4" strokeWidth={2.2} />
    </Button>
  </header>
);
