// lib/chat/types.ts
//
// Переписка замовника з виконавцем: контракт сервера й клієнта.

export interface ChatMessageDto {
  id: string;
  /** Чия репліка в цій розмові: customer — замовник, performer — виконавець. */
  from: "customer" | "performer";
  text: string;
  at: string;
  /** system — подія в стрічці (угоду запропоновано, відгук), а не репліка людини. */
  kind?: "text" | "system";
  /** Про що: id угоди чи запиту. Лише мітка, розмова спільна. */
  contextId?: string;
  /** Фото до повідомлення; адреса віддається лише учасникам розмови. */
  attachments?: { id: string; url: string }[];
}

/** Замовлення між цими двома людьми: рядок у випадайці шапки розмови. */
export interface ConversationOrderDto {
  dealId: string;
  number: string;
  title: string;
  total: number;
  status: "proposed" | "accepted" | "completed";
  /** Що зараз відбувається, одним рядком. */
  state: string;
  /** Чекає моєї дії. */
  needsMe: boolean;
  /** Умови виставив я, відповіді чекаю від другої сторони. */
  mineProposal: boolean;
  /** Умови виставлено в розмові, без запиту. */
  direct: boolean;
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
  /** Для фільтрів списку: chat — лише переписка, deal — є жива угода, done — угоду завершено. */
  phase: "chat" | "deal" | "done";
  /** Запит, на який відгукнувся виконавець (для позначки «Відгук на …»). */
  offer?: { title: string };
  updatedAt: string;
}

export const CHAT_TEXT_MAX = 4000;
export const CHAT_PHOTOS_MAX = 5;
