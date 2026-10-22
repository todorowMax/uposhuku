// Переписка пари для модератора: репліки, системні рядки й фото. Фото тягнемо через
// адмінський маршрут (він перевіряє доступ), а не через шлях учасників розмови.

import type { DisputeMessage } from "@/lib/admin/types";
import { formatStamp } from "@/lib/admin/format";

export function ChatLog({ dealId, messages, customer, performer, hasConversation }: { dealId: string; messages: DisputeMessage[]; customer: string; performer: string; hasConversation: boolean }) {
  if (!hasConversation) return <p className="adm-muted">Розмови в цієї пари ще немає, писати було ніде.</p>;
  if (messages.length === 0) return <p className="adm-muted">У розмові немає повідомлень.</p>;
  return (
    <div className="adm-chat-scroll" tabIndex={0} role="log" aria-label="Переписка замовника й виконавця">
      <ol className="adm-msgs">
        {messages.map((message) =>
          message.kind === "system" ? (
            <li key={message.id} className="adm-sys" data-this={message.contextId === dealId || undefined}>
              <span>{message.text}</span>
              <time dateTime={message.at}>{formatStamp(message.at)}</time>
            </li>
          ) : (
            <li key={message.id} className="adm-msg" data-from={message.from}>
              <p className="adm-msg-who">
                {message.from === "customer" ? `Замовник · ${customer}` : `Виконавець · ${performer}`}
                <time dateTime={message.at}>{formatStamp(message.at)}</time>
              </p>
              {message.text && <p className="adm-msg-text">{message.text}</p>}
              {message.photos.length > 0 && (
                <div className="adm-photos">
                  {message.photos.map((src) => (
                    <a key={src} href={src} target="_blank" rel="noreferrer">
                      {/* Приватне фото з R2 через адмінський маршрут: оптимізатор зображень тут не підходить. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="Фото з розмови" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
