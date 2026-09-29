"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

interface TagRowProps {
  /** Теги, що вже на запиті: знайдені в тексті й додані вручну. */
  selected: string[];
  /** Сірі пропозиції з «+», найімовірніші першими. */
  suggestions: string[];
  labelOf: (id: string) => string;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
}

const GAP = 6;

/**
 * Теги над текстом запиту в один рядок на всю ширину. Що не влізло,
 * ховається за «ще +N»; по кліку відкривається повний список, де так само
 * можна прибрати або додати тег.
 *
 * Скільки чипів влазить, міряємо на невидимій копії рядка: ширина чипа
 * залежить від назви, і вгадувати її з кількості літер ненадійно.
 */
export function TagRow({ selected, suggestions, labelOf, onRemove, onAdd }: TagRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(selected.length + suggestions.length);
  const [open, setOpen] = useState(false);
  const items = [
    ...selected.map((id) => ({ id, kind: "selected" as const })),
    ...suggestions.map((id) => ({ id, kind: "suggested" as const })),
  ];
  const signature = items.map((item) => `${item.kind}:${item.id}`).join("|");

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const recount = () => {
      const available = row.clientWidth;
      const chips = [...measure.querySelectorAll<HTMLElement>("[data-measure-chip]")];
      const more = measure.querySelector<HTMLElement>("[data-measure-more]")?.offsetWidth ?? 0;
      const total = chips.reduce((sum, chip, index) => sum + chip.offsetWidth + (index ? GAP : 0), 0);
      if (total <= available) {
        setFit(chips.length);
        return;
      }
      let used = 0;
      let count = 0;
      for (const chip of chips) {
        const next = used + (count ? GAP : 0) + chip.offsetWidth;
        if (next + GAP + more > available) break;
        used = next;
        count++;
      }
      setFit(count);
    };
    recount();
    const observer = new ResizeObserver(recount);
    observer.observe(row);
    return () => observer.disconnect();
  }, [signature]);

  // Список закривається кліком повз нього й Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !rowRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  const hidden = items.length - fit;

  const chip = (item: (typeof items)[number], measuring = false) =>
    item.kind === "selected" ? (
      <span key={item.id} className="tag-chip" data-kind="selected" title={labelOf(item.id)} {...(measuring ? { "data-measure-chip": "" } : {})}>
        <span className="tag-chip-label">{labelOf(item.id)}</span>
        <button
          type="button"
          tabIndex={measuring ? -1 : 0}
          onClick={() => onRemove(item.id)}
          aria-label={`Прибрати тег «${labelOf(item.id)}»`}
          className="tag-chip-remove"
        >
          <X className="size-3" strokeWidth={2.4} />
        </button>
      </span>
    ) : (
      <button
        key={item.id}
        type="button"
        tabIndex={measuring ? -1 : 0}
        onClick={() => onAdd(item.id)}
        className="tag-chip"
        data-kind="suggested"
        aria-label={`Додати тег «${labelOf(item.id)}»`}
        title={labelOf(item.id)}
        {...(measuring ? { "data-measure-chip": "" } : {})}
      >
        <Plus className="size-3 shrink-0" strokeWidth={2.4} />
        <span className="tag-chip-label">{labelOf(item.id)}</span>
      </button>
    );

  return (
    <div className="relative">
      <div ref={rowRef} className="tag-row" aria-label="Теги запиту">
        {items.slice(0, fit).map((item) => chip(item))}
        {hidden > 0 && (
          <button
            type="button"
            className="tag-more"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            ще +{hidden}
          </button>
        )}
      </div>

      {/* Невидима копія рядка: по ній міряємо, скільки чипів влазить. */}
      <div ref={measureRef} aria-hidden className="tag-row tag-row-measure">
        {items.map((item) => chip(item, true))}
        <span className="tag-more" data-measure-more>ще +99</span>
      </div>

      {open && (
        <div ref={panelRef} className="tag-panel glass-panel" role="dialog" aria-label="Усі теги запиту">
          {selected.length > 0 && (
            <section>
              <h3 className="tag-panel-title">На запиті</h3>
              <div className="tag-panel-list">{items.filter((item) => item.kind === "selected").map((item) => chip(item))}</div>
            </section>
          )}
          {suggestions.length > 0 && (
            <section>
              <h3 className="tag-panel-title">Можна додати</h3>
              <div className="tag-panel-list">{items.filter((item) => item.kind === "suggested").map((item) => chip(item))}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
