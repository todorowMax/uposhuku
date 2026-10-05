// lib/chat/types.ts
//
// Переписка замовника з виконавцем: контракт сервера й клієнта.

export interface ChatMessageDto {
  id: string;
  /** Чия репліка в цій розмові: customer — замовник, performer — виконавець. */
  from: "customer" | "performer";
  text: string;
  at: string;
}

export interface ConversationDto {
  id: string;
  performerId: string;
  /** Моя роль у розмові. */
  role: "customer" | "performer";
  /** Друга сторона: ім'я й фото виконавця для замовника, ім'я замовника для виконавця. */
  other: { name: string; photo?: string; specialty?: string };
  lastMessage: ChatMessageDto | null;
  /** Найновіша жива угода з цією людиною: щоб у списку було видно, де є угода. */
  deal?: { label: string; needsMe: boolean };
  updatedAt: string;
}

export const CHAT_TEXT_MAX = 4000;
