import { describe, expect, it } from "vitest";
import { closeLayer, emptyStack, openLayer, popLayer, topLayerId } from "@/lib/ui/layer-stack";
import { dragOffset, shouldDismiss, startsDrag } from "@/lib/ui/sheet-swipe";

const open = (ids: string[]) => ids.reduce((stack, id) => openLayer(stack, id).stack, emptyStack);

describe("стек шарів", () => {
  it("відкриття кладе один запис, повторне відкриття того ж шару нічого не додає", () => {
    const first = openLayer(emptyStack, "a");
    expect(first.push).toBe(true);
    expect(openLayer(first.stack, "a")).toEqual({ stack: first.stack, push: false });
  });

  it("закриття верхнього шару кнопкою прибирає його запис (go 1)", () => {
    const result = closeLayer(open(["a", "b"]), "b");
    expect(result.go).toBe(1);
    expect(result.stack.map((layer) => layer.id)).toEqual(["a"]);
  });

  it("закриття невідомого шару нічого не робить", () => {
    const stack = open(["a"]);
    expect(closeLayer(stack, "x")).toEqual({ stack, go: 0 });
  });

  it("системне «назад» закриває лише верхній шар", () => {
    const result = popLayer(open(["a", "b"]));
    expect(result.close).toBe("b");
    expect(result.extra).toBe(0);
    expect(topLayerId(result.stack)).toBe("a");
    expect(popLayer(result.stack).close).toBe("a");
  });

  it("«назад» на порожньому стеку нічого не закриває", () => {
    expect(popLayer(emptyStack)).toEqual({ stack: emptyStack, close: null, extra: 0 });
  });

  it("нижній шар, закритий кодом, лишає привида, а верхній при закритті забирає його з собою", () => {
    const afterLower = closeLayer(open(["a", "b"]), "a");
    expect(afterLower.go).toBe(0);
    expect(afterLower.stack).toHaveLength(2);
    const afterUpper = closeLayer(afterLower.stack, "b");
    expect(afterUpper.go).toBe(2);
    expect(afterUpper.stack).toEqual([]);
  });

  it("«назад» з верхнього шару прибирає привидів під ним додатковим кроком", () => {
    const ghosted = closeLayer(open(["a", "b", "c"]), "b").stack;
    const result = popLayer(ghosted);
    expect(result.close).toBe("c");
    expect(result.extra).toBe(1);
    expect(topLayerId(result.stack)).toBe("a");
  });

  it("повторно відкритий шар ставиться нагору, привид його запису лишається в стеку", () => {
    const stack = closeLayer(open(["a", "b"]), "a").stack;
    const reopened = openLayer(stack, "a");
    expect(reopened.push).toBe(true);
    expect(reopened.stack).toHaveLength(3);
    expect(reopened.stack.filter((layer) => layer.id === "a" && layer.live)).toHaveLength(1);
    expect(topLayerId(reopened.stack)).toBe("a");
  });
});

describe("свайп шторки", () => {
  it("тягнеться лише вниз і лише вертикальним рухом", () => {
    expect(startsDrag(0, 20)).toBe(true);
    expect(startsDrag(0, -20)).toBe(false);
    expect(startsDrag(30, 20)).toBe(false);
    expect(startsDrag(0, 4)).toBe(false);
    expect(dragOffset(-30)).toBe(0);
    expect(dragOffset(30)).toBe(30);
  });

  it("закривається далеким протягуванням або швидким змахом, а не малим рухом", () => {
    expect(shouldDismiss(200, 1000, 400)).toBe(true);
    expect(shouldDismiss(40, 1000, 400)).toBe(false);
    expect(shouldDismiss(60, 80, 400)).toBe(true);
    expect(shouldDismiss(-100, 100, 400)).toBe(false);
  });
});
