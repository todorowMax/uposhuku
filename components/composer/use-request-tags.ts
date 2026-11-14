"use client";

// components/composer/use-request-tags.ts
//
// Теги запиту за текстом: що знайшов словник у тексті, що людина прибрала, що додала сама і що ще можна запропонувати.
// Спільне для поля нового запиту (`request-composer.tsx`) і екрана правки (`components/requests/use-edit-request.ts`).

import { useCallback, useMemo, useState } from "react";
import * as tagEngine from "@/lib/tags/engine";
import { trackTagAdded, trackTagRemoved, type TagAddSource } from "@/lib/telemetry/tag-events";

/** Скільки сірих пропозицій показуємо поруч із тегами запиту. */
const MAX_SUGGESTIONS = 6;
/** Скільки тегів людина може додати вручну до тих, що з тексту. */
export const MAX_MANUAL_TAGS = 10;

export namespace RequestTagsTypes {
  export type Initial = { added: string[]; dismissed: string[] };
  export type State = ReturnType<typeof useRequestTags>;
}

export const useRequestTags = (text: string, initial?: RequestTagsTypes.Initial) => {
  /** Теги, які людина прибрала: знову з тексту їх не додаємо. */
  const [dismissed, setDismissed] = useState<string[]>(initial?.dismissed ?? []);
  /** Теги, додані з пропозицій або з вибору. */
  const [added, setAdded] = useState<string[]>(initial?.added ?? []);

  const mentions = useMemo(() => tagEngine.detectTagMentions(text).filter((mention) => !dismissed.includes(mention.tagId)), [text, dismissed]);
  const selected = useMemo(() => [...new Set([...mentions.map((mention) => mention.tagId), ...added])].filter((id) => !dismissed.includes(id)), [mentions, added, dismissed]);
  const suggestions = useMemo(() => tagEngine.suggestTags(selected, { exclude: dismissed, limit: MAX_SUGGESTIONS }).map((suggestion) => suggestion.tagId), [selected, dismissed]);

  const removeTag = (id: string) => {
    const mention = mentions.find((item) => item.tagId === id);
    trackTagRemoved("request", id, mention ? "auto" : "manual", mention ? text.slice(mention.start, mention.end) : undefined);
    setDismissed((current) => [...current, id]);
    setAdded((current) => current.filter((tag) => tag !== id));
  };
  const addTag = (id: string, source: TagAddSource = "suggestion") => {
    trackTagAdded("request", id, source);
    setAdded((current) => (current.includes(id) ? current : [...current, id]));
    setDismissed((current) => current.filter((tag) => tag !== id));
  };
  const manualFull = added.length >= MAX_MANUAL_TAGS;
  /** Для пікера: тег є — знімаємо, нема — додаємо; `false`, коли ручних уже забагато. */
  const toggleTag = (id: string) => {
    if (selected.includes(id)) {
      removeTag(id);
      return true;
    }
    if (mentions.some((mention) => mention.tagId === id)) {
      addTag(id, "picker");
      return true;
    }
    if (manualFull) return false;
    addTag(id, "picker");
    return true;
  };
  /** Чистий аркуш: прибрані й додані теги забуваємо. */
  const reset = useCallback(() => {
    setDismissed([]);
    setAdded([]);
  }, []);

  return { mentions, selected, suggestions, manualFull, removeTag, addTag, toggleTag, reset };
};
