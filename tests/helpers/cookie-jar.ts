// tests/helpers/cookie-jar.ts
//
// Підміна `cookies()` з next/headers для тестів, які викликають auth.ts напряму:
// поза запитом Next кидає помилку. Банка запам'ятовує значення й параметри, з якими їх поставили.
// Підключення: `vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock());`

export interface StoredCookie {
  value: string;
  options: Record<string, unknown>;
}

const store = new Map<string, StoredCookie>();

export const cookieJar = {
  get: (name: string) => (store.has(name) ? { name, value: store.get(name)!.value } : undefined),
  set: (name: string, value: string, options: Record<string, unknown> = {}) => {
    store.set(name, { value, options });
  },
  delete: (name: string) => {
    store.delete(name);
  },
  /** Що поставили: значення й параметри (httpOnly, sameSite, secure...). */
  peek: (name: string) => store.get(name),
  clear: () => store.clear(),
};

export const nextHeadersMock = () => ({ cookies: async () => cookieJar });
