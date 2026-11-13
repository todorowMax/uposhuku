"use client";

// components/account/use-delete-account.ts
//
// Логіка екрана «Видалити акаунт»: що заважає (з сервера), галочка, слово, код з пошти для тих, у кого були угоди,
// відправка. Після видалення сторінка перезавантажується на головну (lib/account/client.ts).

import { useEffect, useState } from "react";
import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { confirmDeletion, deleteScreenStore, DeleteBlockedError, fetchDeleteStatus, requestDeletionCode, type DeleteStatus } from "@/lib/account/client";
import { isDeleteWord } from "@/lib/account/deletion";
import { useStore } from "@/lib/store";

type Load = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; status: DeleteStatus };

const messageOf = (reason: unknown) => (reason instanceof Error ? reason.message : "Щось пішло не так. Спробуйте ще раз.");

export const useDeleteAccount = () => {
  const open = useStore(deleteScreenStore);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [checked, setChecked] = useState(false);
  const [word, setWord] = useState("");
  const [code, setCode] = useState("");
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  // Список перешкод вантажимо при відкритті; стан форми скидає `close`. Результат кладемо в колбеку, не в тілі ефекту.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchDeleteStatus().then(
      (status) => alive && setLoad({ kind: "ready", status }),
      (reason: unknown) => alive && setLoad({ kind: "error", message: messageOf(reason) }),
    );
    return () => {
      alive = false;
    };
  }, [open, reloads]);

  /** Перечитати список (кнопка «ще раз» і випадок, коли гроші зайшли в рух після відкриття екрана). */
  const refresh = () => {
    setLoad({ kind: "loading" });
    setReloads((count) => count + 1);
  };

  const status = load.kind === "ready" ? load.status : null;
  const blocked = (status?.blockers.length ?? 0) > 0;
  const needsCode = status?.needsCode ?? false;
  const canSubmit = status !== null && !blocked && checked && isDeleteWord(word) && (!needsCode || /^\d{4,8}$/.test(code.trim())) && !busy;

  // Закриття (кнопка, Escape, «назад», перехід до розмови) повертає форму до чистого стану: наступне відкриття починається з нуля.
  const close = () => {
    deleteScreenStore.set(false);
    setLoad({ kind: "loading" });
    setChecked(false);
    setWord("");
    setCode("");
    setCodeNote(null);
    setError(null);
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      setCodeNote((await requestDeletionCode()) ? "Код надіслано на пошту акаунта. Він діє 10 хвилин." : "Код щойно надсилали. Зачекайте хвилину й спробуйте знову.");
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await confirmDeletion({ confirm: word, ...(needsCode ? { code: code.trim() } : {}) });
    } catch (reason) {
      // Угода зайшла в рух між відкриттям екрана й натисканням: показуємо свіжий список.
      if (reason instanceof DeleteBlockedError) refresh();
      else setError(messageOf(reason));
      setBusy(false);
    }
  };

  const openChat = (conversationId: string | null) => {
    close();
    if (conversationId) inboxOpenStore.set({ conversationId });
  };

  return { open, close, load, status, blocked, needsCode, checked, setChecked, word, setWord, code, setCode, codeNote, busy, error, canSubmit, sendCode, submit, openChat, retry: refresh };
};
