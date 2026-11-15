"use client";

import { FileText, X } from "@/components/icons";

/** Що потрібно, щоб показати вкладення: імʼя й прев'ю. Збережений запит має лише опис файла, без самого файла. */
export interface AttachmentView {
  id: string;
  file: Pick<File, "name">;
  url: string | null;
}

/**
 * Прикріплені файли над текстом запиту, як прев'ю фото в месенджерах:
 * зображення — мініатюрою, решта — плашкою з назвою. Показує лише опис файлів,
 * збережений у старих запитах: нових файлів композер не додає, на сервер вони не завантажуються.
 */
export const Attachments = ({ items, onRemove }: { items: AttachmentView[]; onRemove: (id: string) => void }) => {
  if (items.length === 0) return null;
  return (
    <ul className="attachments" aria-label="Прикріплені файли">
      {items.map((item) => (
        <li key={item.id} className="attachment" data-kind={item.url ? "image" : "file"}>
          {item.url ? (
            <img src={item.url} alt={item.file.name} className="attachment-image" />
          ) : (
            <span className="attachment-file">
              <FileText className="size-4 shrink-0 text-ink-muted" />
              <span className="truncate">{item.file.name}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Прибрати «${item.file.name}»`}
            className="attachment-remove"
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
};
