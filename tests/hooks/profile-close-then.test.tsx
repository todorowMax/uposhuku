import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/p/me-abc", back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ back: nav.back, replace: nav.replace, push: vi.fn() }),
}));
vi.mock("@/lib/ui/use-layer-history", () => ({ afterLayerHistory: (run: () => void) => run() }));

import { useCloseProfileThen, useRunAfterProfileClose } from "@/lib/profile/navigation";

describe("закрити профіль і лише потім відкрити чат", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nav.pathname = "/p/me-abc";
    nav.back.mockClear();
    nav.replace.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("відкладене виконується, коли адреса вийшла з /p/…, і лише раз", () => {
    const then = vi.fn();
    const closer = renderHook(() => useCloseProfileThen());
    const watcher = renderHook(() => useRunAfterProfileClose());
    closer.result.current(then);
    expect(nav.replace).toHaveBeenCalledWith("/");
    vi.runAllTimers();
    expect(then).not.toHaveBeenCalled();

    nav.pathname = "/";
    watcher.rerender();
    vi.runAllTimers();
    expect(then).toHaveBeenCalledTimes(1);

    watcher.rerender();
    vi.runAllTimers();
    expect(then).toHaveBeenCalledTimes(1);
  });

  it("поки адреса профілю на місці, нічого не відкривається", () => {
    const then = vi.fn();
    renderHook(() => useCloseProfileThen()).result.current(then);
    const watcher = renderHook(() => useRunAfterProfileClose());
    watcher.rerender();
    vi.runAllTimers();
    expect(then).not.toHaveBeenCalled();
  });
});
