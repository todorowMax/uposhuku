// lib/auth/client.ts
//
// Вхід і запити з боку браузера: стан сесії, спільний для кнопки акаунта й
// поля запиту, виклики /api/auth/* і /api/requests. Помилки API приходять
// як problem+json, показуємо їхній detail.

import { createStore } from "@/lib/store";
import type { EmailStartResult, SessionUser } from "./types";
import type { PublishedRequest, RequestDraft } from "@/lib/requests/types";

export type SessionState = { status: "loading" } | { status: "guest" } | { status: "user"; user: SessionUser };

export const sessionStore = createStore<SessionState>({ status: "loading" });

/**
 * Панель входу: «login» — просто увійти, «publish» — увійти й одразу
 * опублікувати чернетку запиту (lib/requests/draft.ts).
 */
export type AuthFlow = { mode: "login" | "publish" | "performer" } | null;
export const authFlowStore = createStore<AuthFlow>(null);

/** Мої запити, нові першими; null — ще не завантажені або гість. */
export const requestsStore = createStore<PublishedRequest[] | null>(null);

/** Запит, що стоїть на місці поля запиту. null — показуємо поле. */
export const activeRequestStore = createStore<string | null>(null);

/** Коротке підтвердження після публікації, без постійної великої картки. */
export const recentlyPublishedRequestStore = createStore<string | null>(null);
let publishedNoticeTimer: ReturnType<typeof setTimeout> | null = null;

/** Відкрити список запитів із меню аватарки або поля вводу. */
export const showRequestsListStore = createStore(false);

/** Людина натиснула «Новий запит»: показуємо поле, хоча запити вже є. */
export const composingStore = createStore(false);

/** Помилка API. `code` це стабільний код з тіла відповіді (`legal_reaccept_required`, `risk_ack_required`). */
export class ApiError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Подія, після якої шторка «Ми оновили умови» перечитує статус (components/legal/use-terms-update). */
export const LEGAL_RECHECK_EVENT = "legal:recheck";

/** Помилка з тіла problem+json: текст для людини й код. Відмова через умови одразу просить показати шторку. */
export const problemError = (data: { detail?: string; title?: string; code?: string } | null): ApiError => {
  if (data?.code === "legal_reaccept_required" && typeof window !== "undefined") window.dispatchEvent(new Event(LEGAL_RECHECK_EVENT));
  return new ApiError(data?.detail ?? data?.title ?? "Щось пішло не так. Спробуйте ще раз.", data?.code);
};

const call = async <T,>(input: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiError("Немає зв'язку. Перевірте інтернет і спробуйте ще раз.");
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => null)) as (T & { detail?: string; title?: string; code?: string }) | null;
  if (!response.ok) throw problemError(data);
  return data as T;
};

let loading: Promise<void> | null = null;

/** Хто увійшов. Кілька компонентів можуть попросити одночасно — запит один. */
export const loadSession = (force = false) => {
  if (loading && !force) return loading;
  loading = call<{ user: SessionUser | null }>("/api/auth/me")
    .then(({ user }) => {
      sessionStore.set(user ? { status: "user", user } : { status: "guest" });
      if (user) {
        void loadMyRequests();
        void import("@/lib/profile/client").then((module) => module.loadMyProfile());
      }
    })
    .catch(() => sessionStore.set({ status: "guest" }));
  return loading;
};

/** `turnstileToken`: токен віджета Cloudflare; без ключів перевірки на сервері його не питають. */
export const startEmail = (email: string, turnstileToken?: string | null) =>
  call<EmailStartResult>("/api/auth/email/start", { method: "POST", body: JSON.stringify({ email, ...(turnstileToken ? { turnstileToken } : {}) }) });

export const verifyEmail = async (email: string, code: string, accepted: boolean) => {
  const { user } = await call<{ user: SessionUser }>("/api/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ email, code, accepted }),
  });
  sessionStore.set({ status: "user", user });
  void loadMyRequests();
  void import("@/lib/profile/client").then((module) => module.loadMyProfile());
  return user;
};

export const logout = async () => {
  await call<void>("/api/auth/logout", { method: "POST" });
  sessionStore.set({ status: "guest" });
  requestsStore.set(null);
  activeRequestStore.set(null);
  showRequestsListStore.set(false);
  recentlyPublishedRequestStore.set(null);
  if (publishedNoticeTimer) clearTimeout(publishedNoticeTimer);
  publishedNoticeTimer = null;
  composingStore.set(false);
  void import("@/lib/profile/client").then((module) => module.forgetProfile());
};

export const publishRequest = async (draft: RequestDraft) =>
  (await call<{ request: PublishedRequest }>("/api/requests", { method: "POST", body: JSON.stringify(draft) })).request;

export const fetchMyRequests = async () => (await call<{ requests: PublishedRequest[] }>("/api/requests")).requests;

export const closeMyRequest = async (id: string) =>
  (await call<{ request: PublishedRequest }>(`/api/requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "closed" }),
  })).request;

/** Перший відкритий запит — його й показуємо на місці поля. */
const firstOpen = (requests: PublishedRequest[]) => requests.find((request) => request.status === "open")?.id ?? null;

export const loadMyRequests = async () => {
  try {
    const requests = await fetchMyRequests();
    requestsStore.set(requests);
    const active = activeRequestStore.get();
    if (!active || !requests.some((request) => request.id === active)) activeRequestStore.set(firstOpen(requests));
  } catch {
    requestsStore.set([]);
  }
};

/** Щойно опублікований запит стає на місце поля. */
export const addPublishedRequest = (request: PublishedRequest) => {
  requestsStore.set([request, ...(requestsStore.get() ?? []).filter((item) => item.id !== request.id)]);
  activeRequestStore.set(request.id);
  recentlyPublishedRequestStore.set(request.id);
  if (publishedNoticeTimer) clearTimeout(publishedNoticeTimer);
  publishedNoticeTimer = setTimeout(() => {
    recentlyPublishedRequestStore.set(null);
    publishedNoticeTimer = null;
  }, 2400);
  composingStore.set(false);
};

/** Закритий запит лишається в списку; на його місце — наступний відкритий або поле. */
export const closeActiveRequest = async (id: string) => {
  const updated = await closeMyRequest(id);
  const requests = (requestsStore.get() ?? []).map((item) => (item.id === id ? updated : item));
  requestsStore.set(requests);
  if (activeRequestStore.get() === id) activeRequestStore.set(firstOpen(requests));
};

/** Показати мої запити на місці поля: активний або найсвіжіший. */
export const showMyRequests = () => {
  const requests = requestsStore.get() ?? [];
  if (!activeRequestStore.get()) activeRequestStore.set(firstOpen(requests) ?? requests[0]?.id ?? null);
  composingStore.set(false);
  if (requests.length > 0) showRequestsListStore.set(true);
};
