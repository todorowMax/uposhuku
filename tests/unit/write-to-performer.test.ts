import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telemetry/track", () => ({ EVENTS: { chatOpened: "chat_opened" }, track: vi.fn() }));

import { inboxOpenStore } from "@/components/chat/inbox/inbox-store";
import { writeToPerformer } from "@/components/maplibre/write-to-performer";
import { authFlowStore, sessionStore, type SessionState } from "@/lib/auth/client";

const signedIn = { status: "user", user: { id: "u1" } } as unknown as SessionState;

describe("«Написати» з картки на карті", () => {
  beforeEach(() => {
    inboxOpenStore.set(null);
    authFlowStore.set(null);
  });

  it("увійшов: відкриває розмову з цим виконавцем", () => {
    sessionStore.set(signedIn);
    writeToPerformer("me-abc");
    expect(inboxOpenStore.get()).toEqual({ conversationId: null, performerId: "me-abc" });
    expect(authFlowStore.get()).toBeNull();
  });

  it("гість: спершу вхід, розмова не відкривається", () => {
    sessionStore.set({ status: "guest" } as unknown as SessionState);
    writeToPerformer("me-abc");
    expect(authFlowStore.get()).toEqual({ mode: "login" });
    expect(inboxOpenStore.get()).toBeNull();
  });
});
