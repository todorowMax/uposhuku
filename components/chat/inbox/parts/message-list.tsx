// components/chat/inbox/parts/message-list.tsx
//
// Стрічка розмови: повідомлення, події, стан завантаження й помилка зв'язку.

import type { Ref } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatLine } from "@/lib/chat/client";

const TIME = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" });

export const MessageList = ({
  ref,
  lines,
  loaded,
  error,
  empty,
  onPhoto,
}: {
  ref: Ref<HTMLDivElement>;
  lines: ChatLine[];
  loaded: boolean;
  error: boolean;
  empty: boolean;
  onPhoto: (url: string) => void;
}) => (
  <div ref={ref} className="dm-scroll inbox-thread" aria-live="polite">
    {!loaded && lines.length === 0 && (
      <div className="inbox-loading" role="status" aria-label="Завантажуємо переписку">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )}
    {loaded && lines.length === 0 && empty && !error && (
      <p className="inbox-hint">Опишіть задачу: що потрібно зробити, строки й бюджет. Домовитесь тут, а коли всі умови зійдуться, оформите угоду.</p>
    )}
    {lines.map((line) =>
      line.kind === "system" ? (
        <p key={line.id} className="dm-system">
          {line.text}
          <time dateTime={line.at}>{TIME.format(new Date(line.at))}</time>
        </p>
      ) : (
        <div key={line.id} className="dm-bubble" data-from={line.from}>
          {line.photos && (
            <div className="dm-photos" data-count={line.photos.length}>
              {line.photos.map((url) => (
                <Button key={url} variant="bare" className="dm-photo" aria-label="Відкрити фото" onClick={() => onPhoto(url)}>
                  <img src={url} alt="Фото з чату" loading="lazy" />
                </Button>
              ))}
            </div>
          )}
          {line.text && <p>{line.text}</p>}
          <time dateTime={line.at}>{TIME.format(new Date(line.at))}</time>
        </div>
      ),
    )}
    {error && <p className="dm-warn">Немає зв&apos;язку з сервером. Повідомлення підтягнуться, щойно він повернеться.</p>}
  </div>
);
