// lib/server/edge-cache.ts
//
// Кеш відповіді на краю Cloudflare (Cache API, `caches.default`). Кеш локальний для
// дата-центру й не реплікується; на custom domain працює, у dev і тестах `caches`
// немає, і тоді просто рахуємо. Ключ завжди фіксований (`<origin>/__cache/<name>`):
// параметри запиту його не змінюють, тож кеш не обійти й не засмітити.
// Помилки не кешуємо. Стан між запитами в модулі не тримаємо (воркер забороняє
// ділити I/O між запитами): лише сам кеш платформи.

import { getCloudflareContext } from "@opennextjs/cloudflare";

interface EdgeCacheOptions {
  request: Request;
  /** Ім'я запису: літери й дефіси. */
  name: string;
  /** Скільки секунд тримати. */
  ttl: number;
  compute: () => Promise<unknown>;
}

const platformCache = (): Cache | null => (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;

/** Клієнту завжди `no-store`: свіжість визначає сервер (TTL), а не HTTP-кеш браузера. */
const toClient = (source: Response): Response => {
  const headers = new Headers(source.headers);
  headers.set("cache-control", "no-store");
  return new Response(source.body, { status: source.status, headers });
};

/** Запис у кеш після відповіді; без контексту воркера чекаємо його тут, щоб не лишати обіцянок без власника. */
const store = async (cache: Cache, key: Request, response: Response) => {
  const work = cache.put(key, response).catch((error) => console.warn("edge-cache: запис не вдався", error));
  try {
    getCloudflareContext().ctx.waitUntil(work);
  } catch {
    await work;
  }
};

export const edgeCached = async ({ request, name, ttl, compute }: EdgeCacheOptions): Promise<Response> => {
  const cache = platformCache();
  if (!cache) return toClient(Response.json(await compute()));
  const key = new Request(`${new URL(request.url).origin}/__cache/${name}`);
  try {
    const hit = await cache.match(key);
    if (hit) return toClient(hit);
  } catch (error) {
    console.warn("edge-cache: читання не вдалось", error);
  }
  // Якщо compute кинув помилку, до запису справа не дійде.
  const fresh = Response.json(await compute(), { headers: { "cache-control": `public, max-age=${ttl}` } });
  await store(cache, key, fresh.clone());
  return toClient(fresh);
};
