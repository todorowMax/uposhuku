import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as mapPerformers } from "@/app/api/map/performers/route";
import { edgeCached } from "@/lib/server/edge-cache";
import { useTestD1 } from "../helpers/d1";

/** Підміна caches.default: Map за адресою, з лічильниками викликів. */
const fakeCaches = () => {
  const store = new Map<string, Response>();
  const puts: string[] = [];
  const cache = {
    match: async (key: Request) => store.get(key.url)?.clone(),
    put: async (key: Request, response: Response) => {
      puts.push(key.url);
      store.set(key.url, response);
    },
  };
  vi.stubGlobal("caches", { default: cache });
  return { store, puts };
};

afterEach(() => vi.unstubAllGlobals());

const req = (path: string) => new Request(`https://dev.example.com${path}`);

describe("edgeCached", () => {
  it("другий запит не рахує, а бере з кешу; параметри запиту ключ не міняють", async () => {
    const { puts } = fakeCaches();
    const compute = vi.fn(async () => ({ n: 1 }));
    const first = await edgeCached({ request: req("/api/map/performers?a=1"), name: "x", ttl: 20, compute });
    const second = await edgeCached({ request: req("/api/map/performers?b=2&c=3"), name: "x", ttl: 20, compute });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(await second.json()).toEqual({ n: 1 });
    expect(puts).toEqual(["https://dev.example.com/__cache/x"]);
    // Клієнту кеш браузера не дозволяємо, TTL веде сервер.
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(second.headers.get("cache-control")).toBe("no-store");
  });

  it("записує в кеш з TTL", async () => {
    const { store } = fakeCaches();
    await edgeCached({ request: req("/a"), name: "y", ttl: 20, compute: async () => ({}) });
    expect(store.get("https://dev.example.com/__cache/y")?.headers.get("cache-control")).toBe("public, max-age=20");
  });

  it("помилку не кешує: наступний запит рахує знову", async () => {
    const { store } = fakeCaches();
    const compute = vi.fn().mockRejectedValueOnce(new Error("D1 впала")).mockResolvedValue({ ok: true });
    await expect(edgeCached({ request: req("/a"), name: "z", ttl: 20, compute })).rejects.toThrow("D1 впала");
    expect(store.size).toBe(0);
    const again = await edgeCached({ request: req("/a"), name: "z", ttl: 20, compute });
    expect(await again.json()).toEqual({ ok: true });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("без caches (dev, тести) просто рахує щоразу", async () => {
    vi.stubGlobal("caches", undefined);
    const compute = vi.fn(async () => ({ n: 1 }));
    await edgeCached({ request: req("/a"), name: "w", ttl: 20, compute });
    await edgeCached({ request: req("/a"), name: "w", ttl: 20, compute });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("збій запису в кеш не ламає відповідь", async () => {
    vi.stubGlobal("caches", { default: { match: async () => undefined, put: async () => Promise.reject(new Error("full")) } });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await edgeCached({ request: req("/a"), name: "v", ttl: 20, compute: async () => ({ ok: 1 }) });
    expect(await response.json()).toEqual({ ok: 1 });
  });
});

describe("GET /api/map/performers", () => {
  let ctx: Awaited<ReturnType<typeof useTestD1>>;
  beforeAll(async () => {
    ctx = await useTestD1();
  });
  afterAll(() => ctx.close());

  it("другий запит (з іншими параметрами) не йде в базу", async () => {
    fakeCaches();
    // Рахуємо звернення до D1 через обгортку над привʼязкою, яку бере getDb().
    const holder = globalThis as { __TEST_D1?: D1Database };
    const real = holder.__TEST_D1 as D1Database;
    let calls = 0;
    holder.__TEST_D1 = new Proxy(real, {
      get: (target, key) => {
        if (key === "prepare" || key === "batch") calls += 1;
        const value = Reflect.get(target, key) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      const first = await mapPerformers(req("/api/map/performers?x=1"));
      expect(first.status).toBe(200);
      const afterFirst = calls;
      expect(afterFirst).toBeGreaterThan(0);
      const second = await mapPerformers(req("/api/map/performers?y=2"));
      expect(second.status).toBe(200);
      expect(calls).toBe(afterFirst);
    } finally {
      holder.__TEST_D1 = real;
    }
  });
});
