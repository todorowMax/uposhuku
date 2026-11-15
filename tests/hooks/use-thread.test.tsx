import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDto } from "@/lib/chat/types";
import type { SendResult } from "@/lib/chat/send-result";

const mocks = vi.hoisted(() => ({
  send: vi.fn<(text: string, photoIds: string[]) => Promise<SendResult>>(),
  clearPhotos: vi.fn(),
  onType: vi.fn(),
}));

vi.mock("@/lib/chat/client", () => ({
  useRemoteChat: () => ({ loaded: true, error: false, lines: [], send: mocks.send, onType: mocks.onType }),
}));
vi.mock("@/components/chat/inbox/use-read-mark", () => ({ useReadMark: () => undefined }));
vi.mock("@/components/chat/inbox/use-feed-scroll", () => ({ useFeedScroll: () => ({}) }));
vi.mock("@/components/chat/inbox/use-propose-intent", () => ({ useProposeIntent: () => undefined }));
vi.mock("@/components/chat/inbox/use-thread-deals", () => ({ useThreadDeals: () => ({ deals: [], ready: true }) }));
vi.mock("@/components/chat/inbox/use-photo-staging", () => ({
  usePhotoStaging: () => ({
    ready: [{ tempId: "t1", preview: "", id: "att_1" }],
    uploading: false,
    clearPhotos: mocks.clearPhotos,
    photos: [],
    photoError: null,
    fileRef: { current: null },
    addFiles: vi.fn(),
    removePhoto: vi.fn(),
  }),
}));

import { useThread } from "@/components/chat/inbox/use-thread";

const conversation = { id: "c1", performerId: "me-u2", role: "customer" } as unknown as ConversationDto;
const setup = () => renderHook(() => useThread(conversation, vi.fn()));

beforeEach(() => {
  mocks.send.mockReset();
  mocks.clearPhotos.mockReset();
  mocks.onType.mockReset();
});

describe("useThread: відправка", () => {
  it("після успіху чистить поле й фото", async () => {
    mocks.send.mockResolvedValue({ ok: true });
    const { result } = setup();
    act(() => result.current.type("Привіт"));
    await act(async () => {
      await result.current.submit();
    });
    expect(mocks.send).toHaveBeenCalledWith("Привіт", ["att_1"]);
    expect(result.current.draft).toBe("");
    expect(mocks.clearPhotos).toHaveBeenCalledTimes(1);
    expect(result.current.sendError).toBeNull();
  });

  it("після відмови лишає текст і фото та показує причину", async () => {
    mocks.send.mockResolvedValue({ ok: false, status: 500 });
    const { result } = setup();
    act(() => result.current.type("Привіт"));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.draft).toBe("Привіт");
    expect(mocks.clearPhotos).not.toHaveBeenCalled();
    expect(result.current.sendError).toBeTruthy();
  });

  it("другий Enter під час відправки не шле удруге", async () => {
    let finish: (value: SendResult) => void = () => undefined;
    mocks.send.mockImplementation(() => new Promise<SendResult>((resolve) => (finish = resolve)));
    const { result } = setup();
    act(() => result.current.type("Привіт"));
    await act(async () => {
      void result.current.submit();
      void result.current.submit();
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
    expect(result.current.draft).toBe("");
  });
});
