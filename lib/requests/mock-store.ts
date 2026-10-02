// lib/requests/mock-store.ts
//
// Запити в пам'яті сервера, поки немає D1 (таблиці requests, request_tags).
// Живуть до перезапуску dev-сервера; на воркері кожен ізолят має свою
// пам'ять, тож там це лише прев'ю. globalThis — щоб гаряче перезавантаження
// коду в dev не стирало список.

import type { PublishedRequest, RequestDraft } from "./types";

interface StoredRequest extends PublishedRequest {
  userId: string;
}

const store = globalThis as typeof globalThis & { __vmRequests?: StoredRequest[] };
const all = () => (store.__vmRequests ??= []);

const strip = ({ userId: _userId, ...request }: StoredRequest): PublishedRequest => request;

export const createRequest = (userId: string, draft: RequestDraft): PublishedRequest => {
  const request: StoredRequest = {
    ...draft,
    id: `req_${crypto.randomUUID().slice(0, 8)}`,
    status: "open",
    createdAt: new Date().toISOString(),
    userId,
  };
  all().unshift(request);
  return strip(request);
};

export const listRequests = (userId: string): PublishedRequest[] =>
  all().filter((request) => request.userId === userId).map(strip);

export const closeRequest = (userId: string, id: string): PublishedRequest | null => {
  const request = all().find((item) => item.id === id && item.userId === userId);
  if (!request) return null;
  request.status = "closed";
  return strip(request);
};

/** Свій запит за id; чужий — як неіснуючий. */
export const findRequest = (userId: string, id: string): PublishedRequest | null => {
  const request = all().find((item) => item.id === id && item.userId === userId);
  return request ? strip(request) : null;
};

/** Відкриті запити інших людей: з них складається стрічка виконавця. */
export const listOthersOpen = (exceptUserId: string): PublishedRequest[] =>
  all().filter((request) => request.userId !== exceptUserId && request.status === "open").map(strip);
