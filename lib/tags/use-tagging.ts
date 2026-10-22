"use client";

// lib/tags/use-tagging.ts
//
// Теги з вільного тексту для будь-якого поля: як у полі запиту, але
// стан тримає сам хук. У кожного тегу є джерело:
//   • з тексту — з'являється сам і зникає, коли слово стерли;
//   • вручну — додано пікером чи сірою «+», живе, поки людина не прибере;
//   • прихований — знайдено в тексті, але прибрано хрестиком: з тексту
//     він більше не повертається, навіть після збереження й перевідкриття.
// Словник вантажиться окремим шматком.

import { useCallback, useEffect, useMemo, useState } from "react";
import { combineTags } from "@/lib/tags/combine";
import { trackTagAdded, trackTagRemoved, type TagAddSource, type TagContext } from "@/lib/telemetry/tag-events";

type TagEngine = typeof import("@/lib/tags/engine");

let enginePromise: Promise<TagEngine> | null = null;
export const loadTagEngine = () => (enginePromise ??= import("@/lib/tags/engine"));
const loadEngine = loadTagEngine;

export interface TaggingInit {
  /** Збережений підсумок: показуємо його, поки словник не підвантажився. */
  tags?: string[];
  manual?: string[];
  hidden?: string[];
}

export interface TaggingOptions {
  suggestionLimit?: number;
  /** Скільки тегів усього (з тексту й вручну). */
  maxTags?: number;
  /** Скільки з них можна додати вручну. */
  maxManual?: number;
  /** Де поле стоїть: для аналітики тегів («додав», «прибрав»). Без нього подій немає. */
  context?: TagContext;
}

export interface Tagging {
  engine: TagEngine | null;
  /** Згадки в тексті для підкреслення: межі в оригінальному рядку. */
  mentions: { tagId: string; start: number; end: number }[];
  /** Усі теги поля: спершу з тексту, далі додані вручну. */
  tags: string[];
  /** З них знайдені в тексті. */
  auto: ReadonlySet<string>;
  manual: string[];
  hidden: string[];
  /** Ручних тегів уже стільки, скільки дозволено. */
  manualFull: boolean;
  suggestions: string[];
  labelOf: (id: string) => string;
  remove: (id: string) => void;
  /** Додати тег; `false`, коли ліміт вичерпано. */
  add: (id: string, source?: TagAddSource) => boolean;
  /** Поставити чи зняти галочку: для пікера. */
  toggle: (id: string) => boolean;
}

export const useTagging = (text: string, init: TaggingInit = {}, { suggestionLimit = 8, maxTags = Infinity, maxManual = Infinity, context }: TaggingOptions = {}): Tagging => {
  const [engine, setEngine] = useState<TagEngine | null>(null);
  const [hidden, setHidden] = useState<string[]>(init.hidden ?? []);
  const [manual, setManual] = useState<string[]>(init.manual ?? []);

  useEffect(() => {
    let cancelled = false;
    void loadEngine().then((module) => !cancelled && setEngine(module));
    return () => {
      cancelled = true;
    };
  }, []);

  // Усе, що словник знаходить у тексті, разом із прихованим: щоб знати, чи тег «з тексту».
  const detected = useMemo(() => (engine ? engine.detectTagMentions(text) : []), [engine, text]);
  const detectedIds = useMemo(() => new Set(detected.map((mention) => mention.tagId)), [detected]);
  const mentions = useMemo(() => detected.filter((mention) => !hidden.includes(mention.tagId)), [detected, hidden]);
  const stored = init.tags;
  const tags = useMemo(
    () => (engine || !stored ? combineTags({ auto: mentions.map((mention) => mention.tagId), manual, hidden, max: maxTags }) : stored),
    [engine, stored, mentions, manual, hidden, maxTags]
  );
  const auto = useMemo(() => new Set(tags.filter((id) => detectedIds.has(id) && !manual.includes(id))), [tags, detectedIds, manual]);
  const suggestions = useMemo(
    () => (engine ? engine.suggestTags(tags, { exclude: hidden, limit: suggestionLimit }).map((item) => item.tagId) : []),
    [engine, tags, hidden, suggestionLimit]
  );
  const manualFull = manual.length >= maxManual;

  const remove = useCallback(
    (id: string) => {
      if (context) {
        // Фрагмент тексту, з якого розпізнано тег: підказка для словника, якщо синонім хибний.
        const mention = detected.find((item) => item.tagId === id);
        trackTagRemoved(context, id, mention ? "auto" : "manual", mention ? text.slice(mention.start, mention.end) : undefined);
      }
      setManual((current) => current.filter((tag) => tag !== id));
      // Хрестик на тегу з тексту ховає його; на ручному просто знімає.
      if (detectedIds.has(id)) setHidden((current) => (current.includes(id) ? current : [...current, id]));
    },
    [detectedIds, detected, text, context]
  );

  const add = useCallback(
    (id: string, source: TagAddSource = "suggestion") => {
      // Тег, що є в тексті, але був прихований, просто повертаємо; решта йде в ручні.
      if (detectedIds.has(id)) {
        setHidden((current) => current.filter((tag) => tag !== id));
        return true;
      }
      if (manual.includes(id)) return true;
      if (manual.length >= maxManual) return false;
      setManual((current) => [...current, id]);
      setHidden((current) => current.filter((tag) => tag !== id));
      if (context) trackTagAdded(context, id, source);
      return true;
    },
    [detectedIds, manual, maxManual, context]
  );

  const toggle = useCallback(
    (id: string) => {
      if (tags.includes(id)) {
        remove(id);
        return true;
      }
      return add(id, "picker");
    },
    [tags, add, remove]
  );

  return {
    engine,
    mentions,
    tags,
    auto,
    manual,
    hidden,
    manualFull,
    suggestions,
    labelOf: (id) => engine?.tagLabel(id) ?? id,
    remove,
    add,
    toggle,
  };
};
