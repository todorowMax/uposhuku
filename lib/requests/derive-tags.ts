// lib/requests/derive-tags.ts
import { detectTags } from "@/lib/tags/detect";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";

const MAX_TAGS = 30;

/**
 * Теги запиту. Зазвичай їх надсилає поле запиту, але якщо людина встигла відправити
 * раніше, ніж завантажився словник (або запит прийшов не з нашого поля), розпізнаємо
 * теги з тексту самі: запит без тегів виконавці не побачать.
 */
export const withTags = (text: string, sent: { id: string; label: string }[]) =>
  sent.length > 0 ? sent : detectTags(text).slice(0, MAX_TAGS).map((id) => ({ id, label: TAGS_BY_ID.get(id)?.label ?? id }));
