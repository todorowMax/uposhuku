import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayerExit } from "@/lib/ui/use-layer-exit";

// Рух підміняємо на межі: тест сам вирішує, коли вихід «закінчився».
const exits: { target: unknown; edge: string; done: () => void; kill: ReturnType<typeof vi.fn> }[] = [];
vi.mock("@/lib/ui/transitions", () => ({
  exitLayer: (target: unknown, edge: string, done: () => void) => {
    const entry = { target, edge, done, kill: vi.fn() };
    exits.push(entry);
    return entry;
  },
}));

const mount = (html: string) => {
  const box = document.createElement("div");
  box.innerHTML = html;
  document.body.appendChild(box);
  return box;
};

describe("закриття шару з рухом", () => {
  beforeEach(() => {
    exits.length = 0;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("шар знімається лише після виходу, край беремо в момент закриття", () => {
    const layer = mount("<button>Згорнути</button>");
    const close = vi.fn();
    const { result } = renderHook(() => useLayerExit({ layer: () => layer, edge: () => "right", close }));
    act(() => result.current());
    expect(close).not.toHaveBeenCalled();
    expect(exits).toHaveLength(1);
    expect(exits[0].target).toBe(layer);
    expect(exits[0].edge).toBe("right");
    act(() => exits[0].done());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("другий виклик під час виходу нічого не робить, після виходу закривати можна знову", () => {
    const layer = mount("");
    const close = vi.fn();
    const { result } = renderHook(() => useLayerExit({ layer: () => layer, edge: () => "bottom", close }));
    act(() => result.current());
    act(() => result.current());
    expect(exits).toHaveLength(1);
    act(() => exits[0].done());
    act(() => result.current());
    expect(exits).toHaveLength(2);
  });

  it("без шару в розмітці закриває одразу", () => {
    const close = vi.fn();
    const { result } = renderHook(() => useLayerExit({ layer: () => null, edge: () => "right", close }));
    act(() => result.current());
    expect(close).toHaveBeenCalledTimes(1);
    expect(exits).toHaveLength(0);
  });

  it("фокус із шару переходить на те, що його повертає; чужий фокус не чіпаємо", () => {
    const layer = mount("<button>Згорнути</button>");
    const tab = mount("<button>Пропозиції</button>").querySelector("button");
    const outside = mount("<button>Інше</button>").querySelector("button");
    const { result, rerender } = renderHook(() => useLayerExit({ layer: () => layer, edge: () => "right", close: () => {}, returnFocusTo: () => tab }));

    layer.querySelector("button")?.focus();
    act(() => result.current());
    act(() => exits[0].done());
    rerender();
    expect(document.activeElement).toBe(tab);

    outside?.focus();
    act(() => result.current());
    act(() => exits[1].done());
    rerender();
    expect(document.activeElement).toBe(outside);
  });

  it("знятий з екрана шар обриває рух і не закриває вдруге", () => {
    const layer = mount("");
    const close = vi.fn();
    const { result, unmount } = renderHook(() => useLayerExit({ layer: () => layer, edge: () => "right", close }));
    act(() => result.current());
    unmount();
    expect(exits[0].kill).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });
});
