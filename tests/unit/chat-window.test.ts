import { describe, expect, it } from "vitest";
import { bumpPanels, panelCountStore, screenDock } from "@/lib/ui/chat-window";

const base = { desktop: "panel", wide: true, roomy: true, chatOpen: true } as const;

describe("панель угоди й чат", () => {
  it("від 1100px з відкритим чатом панель стоїть упритул до чату", () => {
    expect(screenDock(base)).toBe("docked");
  });

  it("від 768 до 1099px панель лягає на чат", () => {
    expect(screenDock({ ...base, roomy: false })).toBe("overlay");
  });

  it("без чату панель одна, на будь-якій ширині від 768px", () => {
    expect(screenDock({ ...base, chatOpen: false })).toBe("alone");
    expect(screenDock({ ...base, chatOpen: false, roomy: false })).toBe("alone");
  });

  it("телефон і вікно по центру не стикуються з чатом", () => {
    expect(screenDock({ ...base, wide: false })).toBe("full");
    expect(screenDock({ ...base, desktop: "dialog" })).toBe("full");
  });

  it("лічильник панелей не йде нижче нуля", () => {
    bumpPanels(-1);
    expect(panelCountStore.get()).toBe(0);
    bumpPanels(1);
    bumpPanels(1);
    bumpPanels(-1);
    expect(panelCountStore.get()).toBe(1);
    bumpPanels(-1);
  });
});
