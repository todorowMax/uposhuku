"use client";

// components/chat/inbox/use-read-mark.ts
//
// Мітка прочитання: поки розмова відкрита й вкладка видима, повідомляємо сервер, що стрічку видно. Шлемо після першого
// завантаження (раніше людина ще нічого не бачила) і щоразу, коли в стрічці з'явилось нове. Вкладка у фоні нічого не
// відмічає: щойно вона знову видима, мітка іде.

import { useEffect, useRef } from "react";
import { markConversationRead } from "@/lib/chat/client";

export const useReadMark = ({ conversationId, ready, version, onRead }: { conversationId: string; ready: boolean; version: string; onRead: (conversationId: string) => void }) => {
  const pending = useRef(true);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  useEffect(() => {
    if (!ready) return;
    pending.current = true;
    const flush = () => {
      if (document.hidden || !pending.current) return;
      pending.current = false;
      markConversationRead(conversationId)
        .then(() => onReadRef.current(conversationId))
        .catch(() => {
          // Не вийшло: повторимо з наступним повідомленням чи поверненням на вкладку.
          pending.current = true;
        });
    };
    flush();
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [conversationId, ready, version]);
};
