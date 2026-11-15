// lib/chat/display.ts
//
// Як розмова підписана в списку й шапці: ім'я чи назва запиту, мітка ролі, ініціали, ознака «співрозмовник видалений».

import { DELETED_NAME } from "@/lib/account/deletion";
import type { ConversationDto } from "./types";

type Shown = Pick<ConversationDto, "other" | "offer" | "role">;

/** Замовник без імені підписується назвою запиту, з якого почалась розмова; без запиту лишається загальне слово. */
export const conversationTitle = (conversation: Shown): string => (conversation.other.nameless && conversation.offer ? conversation.offer.title : conversation.other.name);

export const roleLabel = (conversation: Shown): string => (conversation.role === "performer" ? "замовник" : (conversation.other.specialty ?? "виконавець"));

/** Співрозмовник видалив акаунт: писати йому не можна. */
export const isOtherGone = (conversation: Pick<ConversationDto, "other">): boolean => conversation.other.name === DELETED_NAME;

/** Дві літери для аватара без фото: перші літери перших двох слів. */
export const initialsOf = (title: string): string => {
  const words = title.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  return (
    words
      .slice(0, 2)
      .map((word) => (/\p{L}/u.exec(word)?.[0] ?? "").toUpperCase())
      .join("") || "?"
  );
};
