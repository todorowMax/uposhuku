"use client";

import { useEffect, useRef } from "react";
import { X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useRestoreRequest, useNow } from "@/components/requests/use-restore-request";
import { activeRequestStore, authFlowStore, composingStore, justClosedRequestStore, requestsStore, restoredRequestStore } from "@/lib/auth/client";
import { canRestore } from "@/lib/requests/restore";
import { useStore } from "@/lib/store";

/**
 * Після «Закрити запит»: «Запит закрито. Його можна відновити протягом доби» і кнопка «Відновити». Стоїть над панеллю запитів, доки автор не
 * перейде до іншого запиту, не почне новий чи не сховає блок. Контейнер `role="status"` змонтований завжди, щоб читач екрана чув і закриття,
 * і «Запит відновлено» (SEM-12).
 */
export const RestoreNotice = () => {
  const closedId = useStore(justClosedRequestStore);
  const restoredId = useStore(restoredRequestStore);
  const requests = useStore(requestsStore);
  const activeId = useStore(activeRequestStore);
  const composing = useStore(composingStore);
  const authFlow = useStore(authFlowStore);
  const closedFrom = useRef<string | null>(null);
  const restoreRef = useRef<HTMLButtonElement>(null);
  const { restoringId, error, restore } = useRestoreRequest();
  const now = useNow();
  const request = closedId === null ? null : (requests?.find((item) => item.id === closedId) ?? null);
  const shown = request !== null && canRestore(request, now) && !composing && !authFlow;

  // Блок з'являється разом зі зміною активного запиту: запам'ятовуємо його, а будь-який наступний вибір ховає блок.
  useEffect(() => {
    closedFrom.current = closedId === null ? null : activeRequestStore.get();
    if (closedId !== null) restoreRef.current?.focus();
  }, [closedId]);
  useEffect(() => {
    if (closedId !== null && activeId !== closedFrom.current) justClosedRequestStore.set(null);
  }, [activeId, closedId]);

  const hide = () => {
    justClosedRequestStore.set(null);
    // Блок, у якому був фокус, зникає: фокус на перемикач «Мої запити» або на поле запиту.
    (document.getElementById("my-requests-switch") ?? document.getElementById("request"))?.focus();
  };

  return (
    <div role="status" className="flex w-full justify-center">
      {restoredId !== null && <p className="sr-only">Запит відновлено</p>}
      {shown && (
        <div className="request-summary glass-panel mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
          <p className="min-w-0 flex-1 text-sm text-ink">Запит закрито. Його можна відновити протягом доби</p>
          <Button ref={restoreRef} variant="offer" onClick={() => void restore(request.id)} disabled={restoringId === request.id}>
            Відновити
          </Button>
          <Button variant="icon" aria-label="Сховати" onClick={hide}>
            <X className="size-4" />
          </Button>
          {error && <p role="alert" className="auth-error w-full">{error}</p>}
        </div>
      )}
    </div>
  );
};
