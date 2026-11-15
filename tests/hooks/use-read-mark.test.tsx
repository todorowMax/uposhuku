import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({ markConversationRead: vi.fn<(id: string) => Promise<void>>() }));
vi.mock("@/lib/chat/client", () => client);

import { useReadMark } from "@/components/chat/inbox/use-read-mark";

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
};
const flushPromises = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

beforeEach(() => {
  client.markConversationRead.mockReset();
  client.markConversationRead.mockResolvedValue(undefined);
  setHidden(false);
});
afterEach(() => setHidden(false));

describe("useReadMark", () => {
  it("не відмічає, поки вкладка прихована, і відмічає, коли вона знову видима", async () => {
    setHidden(true);
    const onRead = vi.fn();
    renderHook(() => useReadMark({ conversationId: "c1", ready: true, version: "m1", onRead }));
    await flushPromises();
    expect(client.markConversationRead).not.toHaveBeenCalled();

    setHidden(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushPromises();
    expect(client.markConversationRead).toHaveBeenCalledWith("c1");
    expect(onRead).toHaveBeenCalledWith("c1");
  });

  it("не відмічає до завантаження, відмічає після", async () => {
    const onRead = vi.fn();
    const { rerender } = renderHook((props: { ready: boolean }) => useReadMark({ conversationId: "c1", ready: props.ready, version: "m1", onRead }), {
      initialProps: { ready: false },
    });
    await flushPromises();
    expect(client.markConversationRead).not.toHaveBeenCalled();

    rerender({ ready: true });
    await flushPromises();
    expect(client.markConversationRead).toHaveBeenCalledTimes(1);
    expect(onRead).toHaveBeenCalledWith("c1");
  });

  it("після невдалого запиту повторює на наступному поверненні на вкладку", async () => {
    client.markConversationRead.mockRejectedValueOnce(new Error("500"));
    const onRead = vi.fn();
    renderHook(() => useReadMark({ conversationId: "c1", ready: true, version: "m1", onRead }));
    await flushPromises();
    expect(client.markConversationRead).toHaveBeenCalledTimes(1);
    expect(onRead).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushPromises();
    expect(client.markConversationRead).toHaveBeenCalledTimes(2);
    expect(onRead).toHaveBeenCalledWith("c1");
  });
});
