"use client";

// components/auth/use-turnstile.ts
//
// Віджет Cloudflare Turnstile у панелі входу. Ключ приходить із сервера: без нього (локально, тести) перевірки немає,
// і хук нічого не вимагає. Токен одноразовий: після кожної спроби надіслати код `reset()` просить новий.
// Вигляд `interaction-only`: людина бачить віджет, лише якщо потрібна дія.

import { useEffect, useRef, useState } from "react";
import { TURNSTILE_ACTION } from "@/lib/auth/config";
import { fetchTurnstileSiteKey, loadTurnstile, type TurnstileApi } from "@/lib/auth/turnstile-client";

export const useTurnstile = () => {
  // undefined: ключ ще вантажиться; null: перевірка вимкнена.
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const widgetRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchTurnstileSiteKey().then((key) => alive && setSiteKey(key));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!siteKey || !box) return;
    let alive = true;
    loadTurnstile()
      .then((api) => {
        if (!alive) return;
        apiRef.current = api;
        widgetRef.current = api.render(box, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          theme: "auto",
          size: "flexible",
          appearance: "interaction-only",
          callback: (value) => {
            setToken(value);
            setFailed(false);
          },
          "expired-callback": () => setToken(null),
          "error-callback": () => {
            setToken(null);
            setFailed(true);
          },
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (widgetRef.current) apiRef.current?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [siteKey]);

  /** Токен спожито (успішно чи ні): забираємо його й просимо в Cloudflare новий. */
  const reset = () => {
    setToken(null);
    if (widgetRef.current) apiRef.current?.reset(widgetRef.current);
  };

  const enabled = Boolean(siteKey);
  return { enabled, token, failed, boxRef, reset, pending: siteKey === undefined || (enabled && !token && !failed) };
};

export type TurnstileState = ReturnType<typeof useTurnstile>;
