import { afterEach, describe, expect, it, vi } from "vitest";
import { sendFirstMessage } from "@/lib/requests/direct-chat";

const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe("перше повідомлення з профілю виконавця", () => {
  it("створює розмову, надсилає текст і каже, що вийшло; розмову вдруге не створює", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url === "/api/conversations" && init?.method === "POST") return reply(201, { conversation: { id: "conv_a" } });
        if (url.includes("/messages") && init?.method === "POST") return reply(201, { message: { id: "m1", from: "customer", text: "Привіт", at: new Date().toISOString() } });
        return reply(200, { conversations: [], messages: [], role: "customer" });
      }),
    );
    expect(await sendFirstMessage("me-first", "Привіт")).toEqual({ ok: true });
    expect(await sendFirstMessage("me-first", "Ще")).toEqual({ ok: true });
    expect(calls.filter((call) => call === "POST /api/conversations")).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith("POST /api/conversations/conv_a/messages"))).toHaveLength(2);
  });

  it("при відмові сервера повертає код, а не мовчить", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (url === "/api/conversations" && init?.method === "POST" ? reply(201, { conversation: { id: "conv_b" } }) : reply(429))));
    expect(await sendFirstMessage("me-second", "Привіт")).toEqual({ ok: false, status: 429 });
  });

  it("мережевий збій дає невідомий код", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await sendFirstMessage("me-third", "Привіт")).toEqual({ ok: false, status: null });
  });
});
