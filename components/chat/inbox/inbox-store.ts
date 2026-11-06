// components/chat/inbox/inbox-store.ts
//
// Просять відкрити «Повідомлення» (з посилання в Telegram, з профілю, з відгуку): одразу розмову чи лише список.

import { createStore } from "@/lib/store";

export const inboxOpenStore = createStore<{
  conversationId: string | null;
  /** Відкрити розмову з цим виконавцем (створюємо, якщо її ще не було). */
  performerId?: string;
} | null>(null);
