"use client";

// components/chat/inbox/inbox-panel.tsx
//
// Вхідні повідомлення: розмови, де людина замовник або виконавець. Виконавцю це єдине місце, де видно, що йому
// написали з профілю. Кнопка з'являється, коли є хоч одна розмова. На телефоні вікно на весь екран (список і
// розмова по черзі), від 768 px плаваюче вікно справа внизу. Логіка: use-ts.

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConversationList } from "./parts/conversation-list";
import { Thread } from "./thread";
import { useInbox } from "./use-inbox";

export const InboxPanel = () => {
  const { buttonRef, panelRef, innerRef, signedIn, items, open, setOpen, active, setActive, filter, setFilter, actionCount, size, toggleSize, close } = useInbox();
  if (!signedIn || (items.length === 0 && !open)) return null;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="bare"
        onClick={() => setOpen(true)}
        className="inbox-button"
        style={open ? { visibility: "hidden" } : undefined}
        aria-label={`Повідомлення: ${items.length}`}
      >
        <MessageCircle className="size-4" strokeWidth={1.9} />
        <span className="inbox-label">Повідомлення</span>
        {actionCount > 0 && <span className="inbox-badge">{actionCount}</span>}
      </Button>
      {open && (
        <Dialog open modal={false} onOpenChange={(next) => !next && close()}>
          <DialogContent
            ref={panelRef}
            variant="panel"
            aria-describedby={undefined}
            onInteractOutside={(event) => event.preventDefault()}
            className="inbox-panel"
            data-view={active ? "thread" : "list"}
            data-size={size}
          >
            <div ref={innerRef} className="inbox-inner inbox-split">
              <ConversationList
                items={items}
                activeId={active?.id}
                filter={filter}
                size={size}
                onFilter={setFilter}
                onOpen={setActive}
                onToggleSize={toggleSize}
                onClose={close}
              />
              <div className="inbox-main">
                {active ? (
                  <Thread key={active.id} conversation={active} size={size} onBack={() => setActive(null)} onClose={close} onToggleSize={toggleSize} />
                ) : (
                  <p className="inbox-empty">Оберіть розмову зі списку</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
