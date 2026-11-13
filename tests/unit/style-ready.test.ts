import { describe, expect, it, vi } from "vitest";
import { whenStyleReady } from "@/lib/maplibre/style-ready";

type Handler = () => void;

/** Карта-пустушка: стиль готовий, коли `loaded` істинне; події викликаємо вручну. */
const fakeMap = (loaded: boolean) => {
  const handlers = new Map<string, Set<Handler>>();
  const setFor = (event: string) => handlers.get(event) ?? handlers.set(event, new Set()).get(event)!;
  const map = {
    loaded,
    isStyleLoaded: () => map.loaded,
    on: (event: string, handler: Handler) => void setFor(event).add(handler),
    off: (event: string, handler: Handler) => void setFor(event).delete(handler),
    emit: (event: string) => [...setFor(event)].forEach((handler) => handler()),
    listeners: () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
  };
  return map;
};

describe("whenStyleReady", () => {
  it("стиль готовий: виконує одразу й нічого не підписує", () => {
    const map = fakeMap(true);
    const run = vi.fn();
    whenStyleReady(map as never, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(map.listeners()).toBe(0);
  });

  it("стиль ще не готовий: чекає styledata або idle і виконує один раз", () => {
    const map = fakeMap(false);
    const run = vi.fn();
    whenStyleReady(map as never, run);
    expect(run).not.toHaveBeenCalled();
    map.emit("styledata");
    expect(run).not.toHaveBeenCalled();
    map.loaded = true;
    map.emit("idle");
    map.emit("styledata");
    expect(run).toHaveBeenCalledTimes(1);
    expect(map.listeners()).toBe(0);
  });

  it("скасування знімає підписки й виконання не буде", () => {
    const map = fakeMap(false);
    const run = vi.fn();
    const cancel = whenStyleReady(map as never, run);
    cancel();
    map.loaded = true;
    map.emit("idle");
    expect(run).not.toHaveBeenCalled();
    expect(map.listeners()).toBe(0);
  });
});
