"use client";

// components/phone/use-phone-verify-sheet.ts
//
// Логіка шторки «Підтвердіть телефон» (components/phone/phone-verify-sheet.tsx): початок підтвердження через бота, очікування
// (подія реалтайму `phone` і запасне опитування раз на 3 с, лише поки шторка відкрита й чекає), автозакриття після підтвердження
// з відповіддю тому, хто чекає (дія повторюється). Закриття без підтвердження відповідає «ні».

import { useCallback, useEffect, useState } from "react";
import { ApiError, sessionStore } from "@/lib/auth/client";
import { loadPhoneStatus, phoneSheetStore, startPhoneVerify, usePhoneStatus } from "@/lib/phone/client";
import { PHONE_POLL_MS, phoneSheetState, shouldPoll } from "@/lib/phone/view";
import { useStore } from "@/lib/store";

/** Скільки показуємо «Номер підтверджено», перш ніж повторити дію й закрити шторку (мс). */
const DONE_SHOWN_MS = 1200;

export const usePhoneVerifySheet = () => {
  const session = useStore(sessionStore);
  const status = usePhoneStatus(session.status === "user");
  const request = useStore(phoneSheetStore);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const open = request !== null;
  const verified = status?.verified === true;
  const state = phoneSheetState({ verified, starting, started, error });

  const finish = useCallback(
    (done: boolean) => {
      request?.settle(done);
      setStarting(false);
      setStarted(false);
      setError(null);
      setLink(null);
    },
    [request],
  );

  // Шторку відкрили: свіжий статус (людина могла підтвердити в іншій вкладці).
  useEffect(() => {
    if (open) void loadPhoneStatus();
  }, [open]);

  // Чекаємо бота: подія реалтайму швидша, опитування запасне.
  const polling = shouldPoll(open, state);
  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void loadPhoneStatus(), PHONE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [polling]);

  // Підтвердили в цій шторці: коротко показуємо результат і повертаємо дію тому, хто чекав.
  const justVerified = open && verified && started;
  useEffect(() => {
    if (!justVerified) return;
    const timer = window.setTimeout(() => finish(true), DONE_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [justVerified, finish]);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const result = await startPhoneVerify();
      const url = (result.started ? result.botUrl : result.linkUrl) ?? null;
      setLink(url);
      setStarted(true);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося почати. Спробуйте ще раз.");
    } finally {
      setStarting(false);
    }
  };

  return { open, state, mask: status?.mask ?? null, justVerified, link, error, start, dismiss: () => finish(verified) };
};
