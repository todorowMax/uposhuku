"use client";

// kit/telemetry/client/analytics.ts
//
// Аналітика в браузері. Інтерфейс провайдера навмисно вузький: чотири
// методи, які є в кожній системі аналітики. Свій провайдер (`providers/own`)
// кладе події в нашу базу, а інший (Amplitude, PostHog) можна підключити
// поруч файлом із тими самими чотирма методами; виклики `track()` по
// застосунку при цьому не змінюються.

import { addBreadcrumb } from "./breadcrumbs";
import { getConsent, onConsentChange } from "./consent";
import { getAnonId, getSessionId, randomId } from "./ids";
import { isInternalTraffic } from "./internal";

export type PropValue = string | number | boolean;
export type EventProps = Record<string, PropValue>;

/** Подія в тому вигляді, в якому її отримує кожен провайдер. */
export interface AnalyticsEvent {
  id: string;
  name: string;
  props?: EventProps;
  /** Час події в мілісекундах за годинником клієнта. */
  ts: number;
  path: string;
  /** Сесія: у різних провайдерів вона своя, ми даємо нашу для свого. */
  sessionId: string;
  /** Пристрій; немає, поки немає згоди. */
  anonId: string | null;
}

export interface AnalyticsProvider {
  readonly id: string;
  /** Завестися. Викликається один раз. */
  init(): void;
  track(event: AnalyticsEvent): void;
  /** Перехід між сторінками: у SPA його треба слати вручну. */
  page(event: AnalyticsEvent): void;
  /** Хто це, після входу. `null` — вийшов. */
  identify(userId: string | null): void;
  /** Згоду відкликали: забути все, що не відправлено. */
  reset?(): void;
}

const QUEUE_LIMIT = 50;

let providers: AnalyticsProvider[] = [];
let started = false;
let queue: { kind: "track" | "page"; event: AnalyticsEvent }[] = [];
let userId: string | null = null;
let unsubscribe: (() => void) | null = null;

const dispatch = (kind: "track" | "page", event: AnalyticsEvent) => {
  for (const provider of providers) {
    try {
      provider[kind](event);
    } catch {
      // Один зламаний провайдер не має ламати решту.
    }
  }
};

const makeEvent = (name: string, props: EventProps | undefined, path?: string): AnalyticsEvent => ({
  id: randomId(),
  name,
  props,
  ts: Date.now(),
  path: path ?? (typeof location === "undefined" ? "" : location.pathname),
  sessionId: getSessionId(),
  anonId: getAnonId(),
});

/**
 * Запуск. Подія до запуску складається в чергу (скрипт вантажиться
 * асинхронно, а перша подія трапляється одразу). Відмова від статистики
 * забуває все й зупиняє надсилання.
 */
export const startAnalytics = (list: AnalyticsProvider[]): void => {
  if (started || typeof window === "undefined") return;
  started = true;
  providers = list;
  for (const provider of providers) provider.init();
  if (userId) for (const provider of providers) provider.identify(userId);

  const pending = queue;
  queue = [];
  if (getConsent() !== "denied") for (const item of pending) dispatch(item.kind, item.event);

  unsubscribe = onConsentChange((consent) => {
    if (consent === "denied") {
      queue = [];
      for (const provider of providers) provider.reset?.();
    }
  });
};

const emit = (kind: "track" | "page", event: AnalyticsEvent) => {
  if (getConsent() === "denied") return;
  addBreadcrumb(kind === "page" ? "page" : "event", kind === "page" ? event.path : event.name);
  if (!started) {
    if (queue.length < QUEUE_LIMIT) queue.push({ kind, event });
    return;
  }
  dispatch(kind, event);
};

/** Подія. Нічого не кидає й нічого не показує людині. */
export const track = (name: string, props?: EventProps): void => {
  if (typeof window === "undefined") return;
  emit("track", makeEvent(name, props));
};

export const trackPage = (path: string): void => {
  if (typeof window === "undefined") return;
  // Адреса без параметрів: у них бувають коди й токени, а воронці вони не потрібні.
  const clean = path.split("?")[0].split("#")[0];
  emit("page", makeEvent("page_view", { path: clean }, clean));
};

export const identify = (id: string | null): void => {
  userId = id;
  if (!started) return;
  for (const provider of providers) provider.identify(id);
};

/** Яким провайдерам віддаємо події: для перевірки в консолі, не для логіки. */
export const analyticsProviderIds = (): string[] => providers.map((provider) => provider.id);

export { isInternalTraffic };

/** Лише для тестів. */
export const resetAnalyticsForTests = (): void => {
  providers = [];
  started = false;
  queue = [];
  userId = null;
  unsubscribe?.();
  unsubscribe = null;
};
