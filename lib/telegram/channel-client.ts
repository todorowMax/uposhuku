"use client";

import { useEffect, useState } from "react";

let cached: Promise<boolean> | null = null;

/** Публікація запитів у Telegram-канал увімкнена на сервері? Один запит на життя сторінки. */
const loadChannelEnabled = (): Promise<boolean> =>
  (cached ??= fetch("/api/channel", { cache: "no-store" })
    .then((response) => (response.ok ? (response.json() as Promise<{ enabled: boolean }>) : { enabled: false }))
    .then((data) => Boolean(data.enabled))
    .catch(() => {
      cached = null;
      return false;
    }));

/** Показувати перемикач «У Telegram-каналі», лише коли канал справді працює. */
export const useChannelEnabled = (): boolean => {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadChannelEnabled().then((value) => !cancelled && setEnabled(value));
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
};
