"use client";

import { FileText, Loader2, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { RequestFilesTypes } from "@/components/composer/use-request-files";
import { formatFileSize } from "@/lib/requests/file-types";

export namespace AttachmentsTypes {
  export type Props = {
    items: RequestFilesTypes.Item[];
    /** Загальне повідомлення над списком (наприклад, «До 10 файлів у запиті»). */
    notice?: string | null;
    onRemove: (key: string) => void;
  };
}

/**
 * Файли запиту, які людина додає: назва, розмір і стан (вантажиться, готовий, помилка). Помилку видно словами, не
 * лише кольором; прибрати можна будь-який файл, окрім того, що ще вантажиться. Список для читання виконавцем це
 * `RequestFileLinks` (components/requests/parts).
 */
export const Attachments = ({ items, notice = null, onRemove }: AttachmentsTypes.Props) => {
  if (items.length === 0 && !notice) return null;
  return (
    <>
      {items.length > 0 && (
        <ul className="attachments" aria-label="Прикріплені файли">
          {items.map((item) => (
            <li key={item.key} className="attachment" data-state={item.state}>
              <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="attachment-copy">
                <span className="attachment-name">{item.name}</span>
                {item.state === "uploading" && <span className="attachment-meta">Вантажиться…</span>}
                {item.state === "ready" && <span className="attachment-meta">{formatFileSize(item.size)}</span>}
                {item.state === "error" && (
                  <span role="alert" className="attachment-meta auth-error">
                    {item.error}
                  </span>
                )}
              </span>
              {item.state === "uploading" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-ink-muted" aria-hidden />
              ) : (
                <Button variant="icon" onClick={() => onRemove(item.key)} aria-label={`Прибрати «${item.name}»`}>
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="alert" className="auth-error">
          {notice}
        </p>
      )}
    </>
  );
};
