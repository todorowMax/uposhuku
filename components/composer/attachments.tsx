"use client";

import { FileText, X } from "lucide-react";

export interface Attachment {
  id: string;
  file: File;
  /** Посилання на прев'ю, лише для зображень. */
  url: string | null;
}

/**
 * Прикріплені файли над текстом запиту, як прев'ю фото в месенджерах:
 * зображення — мініатюрою, решта — плашкою з назвою. Поки лише вигляд:
 * файли нікуди не відправляються.
 */
export function Attachments({ items, onRemove }: { items: Attachment[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="attachments" aria-label="Прикріплені файли">
      {items.map((item) => (
        <li key={item.id} className="attachment" data-kind={item.url ? "image" : "file"}>
          {item.url ? (
            <img src={item.url} alt={item.file.name} className="attachment-image" />
          ) : (
            <span className="attachment-file">
              <FileText className="size-4 shrink-0 text-ink-muted" strokeWidth={1.9} />
              <span className="truncate">{item.file.name}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Прибрати «${item.file.name}»`}
            className="attachment-remove"
          >
            <X className="size-3" strokeWidth={2.4} />
          </button>
        </li>
      ))}
    </ul>
  );
}
