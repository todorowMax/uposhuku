"use client";

// kit/telemetry/client/providers/own.ts
//
// Свій провайдер: події копляться в буфері й летять на наш роут пачками.
// Пачка відправляється на 10 подіях або через 5 секунд, а коли вкладку
// ховають чи закривають, одразу, через `sendBeacon`: звичайний запит
// браузер при закритті обриває.

import type { AnalyticsEvent, AnalyticsProvider } from "../analytics";
import { clientConfig } from "../config";
import { isInternalTraffic } from "../internal";

const FLUSH_AT = 10;
const FLUSH_AFTER_MS = 5000;
const BATCH_MAX = 25;
const BATCH_BYTES = 14 * 1024;
/** Скільки неушкоджених подій тримаємо в пам'яті, поки мережі немає. */
const KEEP_MAX = 100;

const utmOf = (search: string) => {
  const params = new URLSearchParams(search);
  const source = params.get("utm_source");
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");
  return source || medium || campaign ? { source, medium, campaign } : undefined;
};

export interface OwnProviderOptions {
  /** Інакше береться з `configureClient`. */
  endpoint?: string;
}

export const ownProvider = (options: OwnProviderOptions = {}): AnalyticsProvider => {
  let buffer: AnalyticsEvent[] = [];
  let timer: number | null = null;
  let firstBatchSent = false;
  let started = false;

  const endpoint = () => options.endpoint ?? clientConfig().ingestUrl;

  /** Пачки, які влазять у ліміт роуту: за кількістю й за розміром. */
  const take = (): AnalyticsEvent[] => {
    const batch: AnalyticsEvent[] = [];
    let bytes = 0;
    while (buffer.length && batch.length < BATCH_MAX) {
      const size = JSON.stringify(buffer[0]).length;
      if (batch.length && bytes + size > BATCH_BYTES) break;
      bytes += size;
      batch.push(buffer.shift()!);
    }
    return batch;
  };

  const payload = (events: AnalyticsEvent[]) => {
    const body: Record<string, unknown> = {
      sentAt: Date.now(),
      internal: isInternalTraffic(),
      events: events.map((event) => ({ id: event.id, name: event.name, props: event.props, ts: event.ts, path: event.path, sessionId: event.sessionId, anonId: event.anonId ?? undefined })),
    };
    // Звідки прийшли, передаємо один раз за завантаження сторінки.
    if (!firstBatchSent) {
      firstBatchSent = true;
      if (document.referrer) body.referrer = document.referrer;
      const utm = utmOf(location.search);
      if (utm) body.utm = utm;
    }
    return JSON.stringify(body);
  };

  const flush = (final = false) => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    while (buffer.length) {
      const events = take();
      const body = payload(events);
      let sent = false;
      if (final && typeof navigator.sendBeacon === "function") {
        try {
          sent = navigator.sendBeacon(endpoint(), new Blob([body], { type: "application/json" }));
        } catch {
          sent = false;
        }
      }
      if (!sent) {
        void fetch(endpoint(), { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {
          // Мережі немає: повертаємо події в буфер до наступної спроби, але в межах пам'яті.
          buffer = [...events, ...buffer].slice(0, KEEP_MAX);
        });
      }
    }
  };

  const schedule = () => {
    if (buffer.length >= FLUSH_AT) flush();
    else if (timer === null) timer = window.setTimeout(() => flush(), FLUSH_AFTER_MS);
  };

  const onHide = () => {
    if (document.visibilityState === "hidden") flush(true);
  };

  return {
    id: "own",
    init() {
      if (started || typeof window === "undefined") return;
      started = true;
      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("pagehide", () => flush(true));
    },
    track(event) {
      buffer.push(event);
      schedule();
    },
    page(event) {
      buffer.push(event);
      schedule();
    },
    identify() {
      // Хто це, сервер знає із сесії: клієнтові про себе віримо не будемо.
    },
    reset() {
      buffer = [];
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    },
  };
};
