// components/profile/parts/profile-contact-bar.tsx
//
// Низ профілю виконавця. Кнопка «Описати задачу виконавцю» перетворюється на поле введення тут же, у профілі: людина
// пише, що їй потрібно, і надсилає, а передумавши, натискає хрестик і лишається в профілі. Якщо розмова вже є,
// лишається проста кнопка «Відкрити чат». Логіка: use-contact-bar.ts.

import { MessageSquareText, Send, X } from "@/components/icons";
import { useContactBar, type ContactBarTypes } from "@/components/profile/use-contact-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { mentionsContacts } from "@/lib/chat/contacts";

export namespace ProfileContactBarTypes {
  export type Props = {
    performerName: string;
    /** З цим виконавцем уже є розмова: кнопка просто відкриває її. */
    hasDialog: boolean;
    onOpenChat: () => void;
  } & ContactBarTypes.Options;
}

export const ProfileContactBar = ({ performerName, hasDialog, onOpenChat, onStart, onSend }: ProfileContactBarTypes.Props) => {
  const { mode, draft, type, error, limit, canSend, shellRef, textRef, open, cancel, submit } = useContactBar({ onStart, onSend });
  if (hasDialog) {
    return (
      <Button className="w-full" onClick={onOpenChat}>
        <MessageSquareText className="size-4" />
        Відкрити чат
      </Button>
    );
  }
  const firstName = performerName.split(/\s+/)[0] ?? performerName;
  return (
    <div className="contact-bar-wrap">
      {mode === "compose" && limit.show && (
        <p className="contact-bar-note" data-tone={limit.over ? "error" : undefined} role={limit.over ? "alert" : undefined}>
          {limit.over ? "Задовге повідомлення: " : ""}
          {limit.text}
        </p>
      )}
      {mode === "compose" && mentionsContacts(draft) && <p className="contact-bar-note">Домовляйтеся тут: поза чатом ми не побачимо домовленостей.</p>}
      {error && (
        <p className="contact-bar-note" data-tone="error" role="alert">
          {error}
        </p>
      )}
      <div ref={shellRef} className="contact-bar" data-mode={mode}>
        {mode === "idle" ? (
          <Button variant="bare" className="contact-bar-open" onClick={open}>
            <MessageSquareText className="size-4" />
            Описати задачу виконавцю
          </Button>
        ) : (
          <form
            className="contact-bar-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Button variant="icon" className="contact-bar-cancel" aria-label="Скасувати" onClick={cancel}>
              <X aria-hidden className="size-4" />
            </Button>
            <label htmlFor="profile-task" className="sr-only">
              {`Опишіть задачу для ${firstName}`}
            </label>
            <Textarea
              id="profile-task"
              ref={textRef}
              variant="chat"
              rows={1}
              value={draft}
              onChange={(event) => type(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={`Опишіть задачу для ${firstName}`}
            />
            <Button type="submit" variant="bare" className="dm-send" aria-label="Надіслати" disabled={!canSend}>
              <Send aria-hidden className="size-4" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};
