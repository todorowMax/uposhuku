import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDto } from "@/lib/chat/types";

const client = vi.hoisted(() => ({
  fetchConversations: vi.fn<() => Promise<ConversationDto[]>>(),
  openConversation: vi.fn<(performerId: string) => Promise<string>>(),
}));
vi.mock("@/lib/chat/client", async () => {
  const { createStore } = await import("@/lib/store");
  return { ...client, conversationsStore: createStore<ConversationDto[]>([]) };
});
// Опитування не крутимо: перше читання списку хук робить сам, повтори йдуть через «Спробувати ще раз».
vi.mock("@/lib/realtime/client", () => ({ startPolling: () => () => undefined }));
vi.mock("@/components/chat/inbox/use-inbox-motion", () => ({ useInboxMotion: () => ({ buttonRef: { current: null }, panelRef: { current: null }, innerRef: { current: null }, size: "normal", toggleSize: vi.fn(), close: vi.fn() }) }));
vi.mock("@/lib/ui/use-keyboard-inset", () => ({ useKeyboardInset: () => undefined }));
vi.mock("@/lib/ui/use-layer-history", () => ({ useLayerHistory: () => undefined }));

import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { useInbox } from "@/components/chat/inbox/use-inbox";
import { sessionStore } from "@/lib/auth/client";

const item = { id: "c1", performerId: "me-p1", role: "customer", other: { name: "Олена" }, phase: "chat" } as unknown as ConversationDto;
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  client.fetchConversations.mockReset();
  client.openConversation.mockReset();
  sessionStore.set({ status: "user", user: { id: "u1", email: "u1@example.com" } as never });
  inboxOpenStore.set(null);
});
afterEach(() => {
  cleanup();
  sessionStore.set({ status: "loading" });
  inboxOpenStore.set(null);
});

describe("useInbox: помилки не ковтаються", () => {
  it("збій завантаження списку вмикає listError, повтор його знімає", async () => {
    client.fetchConversations.mockRejectedValueOnce(new Error("500"));
    const { result } = renderHook(() => useInbox());
    await flush();
    expect(result.current.listError).toBe(true);

    client.fetchConversations.mockResolvedValueOnce([item]);
    act(() => result.current.retry());
    await flush();
    expect(result.current.listError).toBe(false);
    expect(result.current.items).toEqual([item]);
  });

  it("не вдалось відкрити розмову з виконавця: рядок помилки, а «Спробувати ще раз» відкриває її", async () => {
    client.fetchConversations.mockResolvedValue([item]);
    client.openConversation.mockRejectedValueOnce(new Error("500"));
    const { result } = renderHook(() => useInbox());
    await flush();
    act(() => inboxOpenStore.set({ conversationId: null, performerId: "me-p1" }));
    await flush();
    expect(result.current.listError).toBe(true);
    expect(result.current.active).toBeNull();

    client.openConversation.mockResolvedValueOnce("c1");
    act(() => result.current.retry());
    await flush();
    expect(result.current.listError).toBe(false);
    expect(result.current.active).toEqual(item);
  });
});
