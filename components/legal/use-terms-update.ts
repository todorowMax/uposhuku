"use client";

// components/legal/use-terms-update.ts
//
// Логіка шторки «Ми оновили умови»: тягне статус для того, хто увійшов, і показує шторку, якщо є що прийняти.
// Шторку можна закрити («Пізніше»): карта, чат і читання працюють, а гроші стоять (сервер відповідає 409
// `legal_reaccept_required`); відмова сервера перечитує статус і показує шторку знову.

import { useEffect, useState } from "react";
import { ApiError, LEGAL_RECHECK_EVENT, sessionStore } from "@/lib/auth/client";
import { acceptDocs, legalStatusStore, loadLegalStatus } from "@/lib/legal/client";
import { useStore } from "@/lib/store";

export const useTermsUpdate = () => {
  const session = useStore(sessionStore);
  const status = useStore(legalStatusStore);
  // «Пізніше»: шторку закрили, але статус лишається (гроші стоять); показуємо знову після відмови сервера.
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = session.status === "user";
  const pending = status?.pending ?? [];

  // Увійшов (або сесія відновилась): питаємо сервер. Вийшов: забуваємо.
  useEffect(() => {
    if (signedIn) void loadLegalStatus();
    else legalStatusStore.set(null);
  }, [signedIn]);

  // Сервер відмовив у грошовій дії через умови: перечитуємо й показуємо шторку знову.
  useEffect(() => {
    const recheck = () =>
      void loadLegalStatus().then(() => {
        setDismissed(false);
      });
    window.addEventListener(LEGAL_RECHECK_EVENT, recheck);
    return () => window.removeEventListener(LEGAL_RECHECK_EVENT, recheck);
  }, []);

  const accept = async () => {
    if (busy || pending.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await acceptDocs(pending);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося записати згоду. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  return { open: signedIn && !dismissed && pending.length > 0, pending, busy, error, accept, later: () => setDismissed(true) };
};
