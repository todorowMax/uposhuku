"use client";

// lib/tags/use-tagging.ts
//
// Теги з вільного тексту для будь-якого поля: як у полі запиту, але
// стан тримає сам хук. Теги з тексту з'являються самі, людина може
// прибрати зайвий (знову з тексту він не повернеться) або додати
// пропозицію одним кліком. Словник вантажиться окремим шматком.

import { useEffect, useMemo, useState } from "react";

type TagEngine = typeof import("@/lib/tags/engine");

let enginePromise: Promise<TagEngine> | null = null;
const loadEngine = () => (enginePromise ??= import("@/lib/tags/engine"));

export interface Tagging {
  engine: TagEngine | null;
  /** Згадки в тексті для підкреслення: межі в оригінальному рядку. */
  mentions: { tagId: string; start: number; end: number }[];
  /** Усі теги поля: спершу з тексту, далі додані вручну чи збережені раніше. */
  tags: string[];
  suggestions: string[];
  labelOf: (id: string) => string;
  remove: (id: string) => void;
  add: (id: string) => void;
}

export const useTagging = (text: string, initial: string[] = [], suggestionLimit = 8): Tagging => {
  const [engine, setEngine] = useState<TagEngine | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>(initial);

  useEffect(() => {
    let cancelled = false;
    void loadEngine().then((module) => !cancelled && setEngine(module));
    return () => {
      cancelled = true;
    };
  }, []);

  const mentions = useMemo(
    () => (engine ? engine.detectTagMentions(text).filter((mention) => !dismissed.includes(mention.tagId)) : []),
    [engine, text, dismissed]
  );
  const tags = useMemo(
    () => [...new Set([...mentions.map((mention) => mention.tagId), ...added])].filter((id) => !dismissed.includes(id)),
    [mentions, added, dismissed]
  );
  const suggestions = useMemo(
    () => (engine ? engine.suggestTags(tags, { exclude: dismissed, limit: suggestionLimit }).map((item) => item.tagId) : []),
    [engine, tags, dismissed, suggestionLimit]
  );

  return {
    engine,
    mentions,
    tags,
    suggestions,
    labelOf: (id) => engine?.tagLabel(id) ?? id,
    remove: (id) => {
      setDismissed((current) => [...current, id]);
      setAdded((current) => current.filter((tag) => tag !== id));
    },
    add: (id) => {
      setAdded((current) => [...current, id]);
      setDismissed((current) => current.filter((tag) => tag !== id));
    },
  };
};
