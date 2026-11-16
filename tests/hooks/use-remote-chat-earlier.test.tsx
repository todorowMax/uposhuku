import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessageDto } from "@/lib/chat/types";

// Опитування не крутимо: перше читання робить сам хук, наступні в цих тестах викликаємо руками.
const realtime = vi.hoisted(() => ({ tick: null as null | (() => void) }));
vi.mock("@/lib/realtime/client", () => ({
  startPolling: (tick: () => void) => {
    realtime.tick = tick;
    return () => undefined;
  },
  notifyTyping: vi.fn(),
  useTyping: () => false,
}));

import { useRemoteChat } from "@/lib/chat/client";

const msg = (n: number, from: "customer" | "performer" = "customer"): ChatMessageDto => ({ id: `m${n}`, from, text: `t${n}`, at: new Date(1_700_000_000_000 + n).toISOString() });
const fetchMock = vi.fn<(url: string) => Promise<Response>>();
const reply = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as Response);
const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const setup = async () => {
  fetchMock.mockImplementationOnce(() => reply({ role: "customer", messages: [msg(3), msg(4)], hasMore: true }));
  const hook = renderHook(() => useRemoteChat("me-x", true, undefined, { id: "c1", role: "customer" }));
  await flush();
  return hook;
};

describe("useRemoteChat: «показати раніше»", () => {
  it("перша сторінка вмикає hasMore, loadEarlier ставить старіші на початок і питає за курсором найстарішого", async () => {
    const { result } = await setup();
    expect(result.current.hasMore).toBe(true);
    expect(result.current.lines.map((line) => line.id)).toEqual(["m3", "m4"]);

    fetchMock.mockImplementationOnce(() => reply({ role: "customer", messages: [msg(1), msg(2), msg(3)], hasMore: false }));
    await act(async () => {
      await result.current.loadEarlier();
    });
    const url = fetchMock.mock.calls.at(-1)?.[0] ?? "";
    expect(decodeURIComponent(url)).toContain(`before=${Date.parse(msg(3).at)}:m3`);
    // m3 уже була: дубль відсікається, порядок зростаючий.
    expect(result.current.lines.map((line) => line.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.earlier).toBe("idle");
  });

  it("помилка лишає кнопку й нічого не губить; повтор після помилки спрацьовує", async () => {
    const { result } = await setup();
    fetchMock.mockImplementationOnce(() => reply({}, false));
    await act(async () => {
      await result.current.loadEarlier();
    });
    expect(result.current.earlier).toBe("error");
    expect(result.current.hasMore).toBe(true);
    expect(result.current.lines).toHaveLength(2);

    fetchMock.mockImplementationOnce(() => reply({ role: "customer", messages: [msg(2)], hasMore: false }));
    await act(async () => {
      await result.current.loadEarlier();
    });
    expect(result.current.earlier).toBe("idle");
    expect(result.current.lines.map((line) => line.id)).toEqual(["m2", "m3", "m4"]);
  });

  it("опитування від мітки після підвантаження не скидає hasMore й не чіпає мітку since", async () => {
    const { result } = await setup();
    fetchMock.mockImplementationOnce(() => reply({ role: "customer", messages: [msg(2)], hasMore: true }));
    await act(async () => {
      await result.current.loadEarlier();
    });
    fetchMock.mockImplementationOnce(() => reply({ role: "customer", messages: [msg(5, "performer")], hasMore: false }));
    await act(async () => {
      realtime.tick?.();
    });
    await flush();
    const url = fetchMock.mock.calls.at(-1)?.[0] ?? "";
    expect(url).toContain(`since=${Date.parse(msg(4).at)}`);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.lines.map((line) => line.id)).toEqual(["m2", "m3", "m4", "m5"]);
  });
});
