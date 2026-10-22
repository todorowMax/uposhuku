"use client";

import type { ReactNode } from "react";
import { Check, Clock, Plus, X } from "@/components/icons";

/**
 * Теги в кілька рядків: вибрані з хрестиком, нижче сірі пропозиції з «+».
 * Тег, підтверджений роботою, має галочку: такі вагоміші для підбору.
 */
export function TagChips({
  tags,
  suggestions,
  proven,
  labelOf,
  onRemove,
  onAdd,
  emptyHint,
  pending,
  onRemovePending,
  children,
}: {
  tags: string[];
  suggestions: string[];
  proven?: ReadonlySet<string>;
  labelOf: (id: string) => string;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
  emptyHint?: string;
  /** Запропоновані, але ще не додані до словника теги: чип «на розгляді». */
  pending?: { id: string; text: string }[];
  onRemovePending?: (id: string) => void;
  /** Після чипів: кнопка «+ Додати тег». */
  children?: ReactNode;
}) {
  const empty = tags.length === 0 && suggestions.length === 0 && !pending?.length;
  if (empty && !emptyHint && !children) return null;
  // Корінь один і той самий у порожньому й заповненому стані: інакше кнопка
  // «+ Додати тег» створюється заново, і відкрита випадайка закривається.
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {empty && emptyHint && <p className="w-full text-[12px] leading-relaxed text-ink-muted">{emptyHint}</p>}
      {tags.map((id) => (
        <span key={id} className="tag-chip" data-kind="selected" title={proven?.has(id) ? "Підтверджено вашою роботою" : labelOf(id)}>
          {proven?.has(id) && <Check aria-label="Підтверджено роботою" className="size-3 shrink-0 text-brand" />}
          <span className="tag-chip-label">{labelOf(id)}</span>
          <button type="button" onClick={() => onRemove(id)} aria-label={`Прибрати тег «${labelOf(id)}»`} className="tag-chip-remove">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {suggestions.map((id) => (
        <button key={id} type="button" onClick={() => onAdd(id)} className="tag-chip" data-kind="suggested" aria-label={`Додати тег «${labelOf(id)}»`} title={labelOf(id)}>
          <Plus className="size-3 shrink-0" />
          <span className="tag-chip-label">{labelOf(id)}</span>
        </button>
      ))}
      {pending?.map((item) => (
        <span key={item.id} className="tag-chip" data-kind="pending" title="На розгляді. Коли додамо тег у словник, він з'явиться тут сам">
          <Clock aria-hidden className="size-3 shrink-0" />
          <span className="tag-chip-label">{item.text}</span>
          <span className="sr-only">, на розгляді</span>
          <button type="button" onClick={() => onRemovePending?.(item.id)} aria-label={`Прибрати пропозицію «${item.text}»`} className="tag-chip-remove">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {children}
    </div>
  );
}
