// lib/ui/chat-window.ts
//
// Панель угоди (`Screen desktop="panel"`) і вікно чату на десктопі. Від 1100px, коли чат відкритий, вони одне вікно
// «угода + чат»: панель стоїть упритул ліворуч від чату (`docked`). Вужче двом половинам немає місця, і панель лягає
// на чат (`overlay`, у шапці «← До чату»). Без чату панель одна (`alone`). Телефон і вікно по центру не стикуються (`full`).
// CSS читає `data-chat` на екрані й тримає той самий поріг 1100px (`DOCK_QUERY`, `@media` у globals.css).

import { createStore } from "@/lib/store";

/** Від цієї ширини панель угоди й чат вміщаються поруч (420 + 420 + поля). Той самий поріг у `@media` в globals.css. */
export const DOCK_QUERY = "(min-width: 1100px)";

/** Вікно чату (`components/chat/inbox/inbox-panel.tsx`): за ним Tab переходить з панелі і назад. */
export const CHAT_SELECTOR = ".inbox-panel";

/** Вікно чату відкрите (ставить `useInbox`). */
export const chatOpenStore = createStore(false);

/** Скільки панелей угоди відкрито на десктопі (ставить `Screen`): розгорнутий чат за цей час стискається. */
export const panelCountStore = createStore(0);

export namespace ChatWindowTypes {
  export type Dock = "full" | "alone" | "overlay" | "docked";
  export type Input = {
    desktop: "panel" | "dialog";
    /** Від 768px. */
    wide: boolean;
    /** Від 1100px. */
    roomy: boolean;
    chatOpen: boolean;
  };
}

export const screenDock = ({ desktop, wide, roomy, chatOpen }: ChatWindowTypes.Input): ChatWindowTypes.Dock => {
  if (!wide || desktop !== "panel") return "full";
  if (!chatOpen) return "alone";
  return roomy ? "docked" : "overlay";
};

/** Лічильник відкритих панелей: +1 при відкритті, −1 при закритті, не нижче нуля. */
export const bumpPanels = (delta: 1 | -1): void => {
  panelCountStore.set(Math.max(0, panelCountStore.get() + delta));
};
