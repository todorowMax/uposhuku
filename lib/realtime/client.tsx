"use client";

// lib/realtime/client.tsx
//
// Реальний час у браузері. Два сокети: `global` (публічні події) завжди і `me`
// (особисті) для того, хто увійшов. Подія лише каже «щось змінилось», а дані
// кожен екран перечитує своїм API. Опитування лишається запасним: поки сокети
// живі, воно рідкісне, а впав сокет (або його немає, як у локальному next dev),
// повертається звичайна частота.

import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { createStore, useStore } from "@/lib/store";
import type { RealtimeEvent, RealtimeType } from "./types";

type Handler = (event: RealtimeEvent) => void;

const handlers = new Set<Handler>();
/** Усі потрібні сокети зараз відкриті. */
export const realtimeConnected = createStore(false);

export const onRealtime = (handler: Handler) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

const dispatch = (event: RealtimeEvent) => {
  for (const handler of [...handlers]) handler(event);
};

/** Після (пере)підключення: невідомо, що пропущено, тож кожен екран перечитує своє. */
const refreshEverything = () => {
  dispatch({ t: "message", conversationId: "" });
  dispatch({ t: "deal", requestId: "" });
  dispatch({ t: "offer", requestId: "" });
  dispatch({ t: "feed" });
  dispatch({ t: "map" });
};

const PING_MS = 25_000;
const FAST_RETRIES = 5;

interface Channel {
  close: () => void;
  reconnectNow: () => void;
}

const openChannel = (path: string, onState: (open: boolean) => void): Channel => {
  let socket: WebSocket | null = null;
  let retries = 0;
  let retryTimer = 0;
  let pingTimer = 0;
  let closed = false;

  const connect = () => {
    window.clearTimeout(retryTimer);
    if (closed || (socket && socket.readyState <= WebSocket.OPEN)) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`);
    } catch {
      return;
    }
    socket = ws;
    ws.onopen = () => {
      retries = 0;
      onState(true);
      refreshEverything();
      pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), PING_MS);
    };
    ws.onmessage = (message) => {
      if (message.data === "pong") return;
      try {
        dispatch(JSON.parse(String(message.data)) as RealtimeEvent);
      } catch {
        // Не наша подія: ігноруємо.
      }
    };
    ws.onclose = () => {
      window.clearInterval(pingTimer);
      onState(false);
      socket = null;
      if (closed) return;
      // Спершу швидкі повтори, далі рідко: без сокетів (локальний dev) не засмічуємо консоль.
      retryTimer = window.setTimeout(connect, retries >= FAST_RETRIES ? 300_000 : Math.min(30_000, 1000 * 2 ** retries));
      retries += 1;
    };
    ws.onerror = () => ws.close();
  };

  connect();
  return {
    close: () => {
      closed = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      socket?.close();
    },
    // Вкладка знову видима: не чекаємо таймера, якщо сокет упав.
    reconnectNow: () => {
      if (!socket) {
        retries = 0;
        connect();
      }
    },
  };
};

/** Підключає сокети. Монтується один раз у layout. */
export function RealtimeSync() {
  const session = useStore(sessionStore);
  const signedIn = session.status === "user";

  useEffect(() => {
    const open = new Set<string>();
    const wanted = signedIn ? 2 : 1;
    const track = (name: string) => (isOpen: boolean) => {
      if (isOpen) open.add(name);
      else open.delete(name);
      realtimeConnected.set(open.size >= wanted);
    };
    const channels = [openChannel("/api/realtime/global", track("global")), ...(signedIn ? [openChannel("/api/realtime/me", track("me"))] : [])];
    const onVisible = () => {
      if (!document.hidden) channels.forEach((channel) => channel.reconnectNow());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      channels.forEach((channel) => channel.close());
      realtimeConnected.set(false);
    };
  }, [signedIn]);

  return null;
}

/**
 * Опитування, яке оживає від подій. Звичайно кожні `ms`, а поки сокети живі,
 * вісім разів рідше (запасний шлях). Подія потрібного типу запускає `run`
 * одразу. Повертає функцію зупинки.
 */
export const startPolling = (run: () => void, ms: number, types: RealtimeType[]): (() => void) => {
  let timer = 0;
  let debounce = 0;
  const schedule = () => {
    timer = window.setTimeout(() => {
      run();
      schedule();
    }, realtimeConnected.get() ? Math.max(ms * 8, 20_000) : ms);
  };
  schedule();
  const off = onRealtime((event) => {
    if (!types.includes(event.t)) return;
    window.clearTimeout(debounce);
    debounce = window.setTimeout(run, 120);
  });
  return () => {
    window.clearTimeout(timer);
    window.clearTimeout(debounce);
    off();
  };
};
