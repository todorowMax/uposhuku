"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUp, MessageCircle, X } from "lucide-react";
import { fetchConversations, useRemoteChat } from "@/lib/chat/client";
import { CHAT_TEXT_MAX, type ConversationDto } from "@/lib/chat/types";
import { sessionStore } from "@/lib/auth/client";
import { mentionsContacts } from "@/lib/requests/mock-chat";
import { useStore } from "@/lib/store";

const TIME = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" });
const POLL_MS = 8000;

/**
 * Вхідні повідомлення: розмови, де людина замовник або виконавець. Виконавцю це
 * єдине місце, де видно, що йому написали з профілю. Кнопка з'являється, коли є
 * хоч одна розмова; список оновлюється раз на кілька секунд.
 */
export function InboxPanel() {
  const session = useStore(sessionStore);
  const [items, setItems] = useState<ConversationDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ConversationDto | null>(null);
  const signedIn = session.status === "user";

  useEffect(() => {
    if (!signedIn) {
      setItems([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      void fetchConversations()
        .then((list) => !cancelled && setItems(list))
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [signedIn, open]);

  if (!signedIn || items.length === 0) return null;
  const asPerformer = items.filter((item) => item.role === "performer").length;

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="inbox-button" aria-label={`Повідомлення: ${items.length}`}>
          <MessageCircle className="size-4" strokeWidth={1.9} />
          Повідомлення
          {asPerformer > 0 && <span className="inbox-badge">{asPerformer}</span>}
        </button>
      )}
      {open && (
        <section role="dialog" aria-label="Повідомлення" className="inbox-panel">
          {active ? (
            <Thread conversation={active} onBack={() => setActive(null)} onClose={() => setOpen(false)} />
          ) : (
            <>
              <header className="inbox-header">
                <h2>Повідомлення</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="Закрити" className="dr-close">
                  <X className="size-4" strokeWidth={2.2} />
                </button>
              </header>
              <ul className="inbox-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setActive(item)} className="inbox-row">
                      <span className="inbox-name">
                        {item.other.name}
                        <em>{item.role === "performer" ? "замовник" : (item.other.specialty ?? "виконавець")}</em>
                      </span>
                      <span className="inbox-preview">{item.lastMessage ? item.lastMessage.text : "Без повідомлень"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}

function Thread({ conversation, onBack, onClose }: { conversation: ConversationDto; onBack: () => void; onClose: () => void }) {
  const chat = useRemoteChat(conversation.performerId, true, undefined, { id: conversation.id, role: conversation.role });
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.lines.length]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void chat.send(text);
    setDraft("");
  };

  return (
    <>
      <header className="inbox-header">
        <button type="button" onClick={onBack} aria-label="До списку" className="dr-close">
          <ArrowLeft className="size-4" strokeWidth={2.2} />
        </button>
        <h2 className="min-w-0 flex-1 truncate">{conversation.other.name}</h2>
        <button type="button" onClick={onClose} aria-label="Закрити" className="dr-close">
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </header>
      <div ref={listRef} className="dm-scroll inbox-thread" aria-live="polite">
        {chat.lines.map((line) => (
          <div key={line.id} className="dm-bubble" data-from={line.from}>
            <p>{line.text}</p>
            <time dateTime={line.at}>{TIME.format(new Date(line.at))}</time>
          </div>
        ))}
        {chat.error && <p className="dm-warn">Немає зв'язку з сервером. Повідомлення підтягнуться, щойно він повернеться.</p>}
      </div>
      {mentionsContacts(draft) && <p className="dm-warn">Домовляйтеся тут: поза чатом ми не побачимо домовленостей.</p>}
      <form onSubmit={submit} className="dm-input-row">
        <label htmlFor="inbox-input" className="sr-only">
          Повідомлення
        </label>
        <textarea
          id="inbox-input"
          rows={1}
          value={draft}
          maxLength={CHAT_TEXT_MAX}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Повідомлення"
          className="dm-input"
        />
        <button type="submit" disabled={!draft.trim()} aria-label="Надіслати" className="dm-send">
          <ArrowUp className="size-4" strokeWidth={2.4} />
        </button>
      </form>
    </>
  );
}
