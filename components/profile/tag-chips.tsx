"use client";

import { Check, Plus, X } from "@/components/icons";

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
}: {
  tags: string[];
  suggestions: string[];
  proven?: ReadonlySet<string>;
  labelOf: (id: string) => string;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
  emptyHint?: string;
}) {
  if (tags.length === 0 && suggestions.length === 0) {
    return emptyHint ? <p className="text-[12px] leading-relaxed text-ink-muted">{emptyHint}</p> : null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
    </div>
  );
}
