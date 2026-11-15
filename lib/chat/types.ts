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

export interface ConversationDto {
  id: string;
  performerId: string;
  /** Моя роль у розмові. */
  role: "customer" | "performer";
  /** Друга сторона: ім'я й фото виконавця для замовника, ім'я замовника для виконавця. */
  other: { name: string; photo?: string; specialty?: string; /** Замовник без імені: у списку й шапці замість «Замовник» показуємо назву запиту. */ nameless?: boolean };
  lastMessage: ChatMessageDto | null;
  /** Остання репліка людини (не службовий рядок): з неї береться превʼю в списку. */
  lastHumanMessage: ChatMessageDto | null;
  /** Хтось із двох уже писав сам (не лише системні рядки про відгук чи угоду): тоді картка пропозиції каже «Чат відкрито». */
  talked: boolean;
  /** Найновіша жива угода з цією людиною: щоб у списку було видно, де є угода. */
  deal?: { label: string; needsMe: boolean };
  /** Скільки текстових повідомлень другої сторони новіші за мою мітку прочитання (стеля 99). Службові рядки сюди не входять. */
  unread: number;
  /** Угода чекає на мене, і в стрічці є службовий рядок новіший за мою мітку: це теж непрочитане. */
  unreadDeal: boolean;
  /** Для фільтрів списку: chat — лише переписка, deal — є жива угода, done — угоду завершено. */
  phase: "chat" | "deal" | "done";
  /** Запит, на який відгукнувся виконавець (для позначки «Відгук на …»). */
  offer?: { title: string };
  updatedAt: string;
}

export const CHAT_TEXT_MAX = 4000;
export const CHAT_PHOTOS_MAX = 5;
