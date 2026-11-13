"use client";

// components/composer/tag-row.tsx
//
// Теги над текстом запиту в один рядок на всю ширину. Що не влізло, ховається за «ще +N»: по кліку повний список,
// де так само можна прибрати або додати тег. Список на телефоні шторка, від 768 px поповер під кнопкою (DESIGN.md,
// «Шари»). Скільки чипів влазить, рахує `use-tag-row-fit.ts`; чип у `parts/tag-row-chip.tsx`.

import { useState, type ReactNode } from "react";
import { TagRowChip } from "@/components/composer/parts/tag-row-chip";
import { useTagRowFit } from "@/components/composer/use-tag-row-fit";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/ui/use-media-query";

export namespace TagRowTypes {
  export type Props = {
    /** Теги, що вже на запиті: знайдені в тексті й додані вручну. */
    selected: string[];
    /** Сірі пропозиції з «+», найімовірніші першими. */
    suggestions: string[];
    labelOf: (id: string) => string;
    onRemove: (id: string) => void;
    onAdd: (id: string) => void;
    /** Стоїть після рядка завжди, навіть коли чипи не влізли: «+ Додати тег». */
    action?: ReactNode;
  };
}

const TITLE = "Усі теги запиту";

export const TagRow = ({ selected, suggestions, labelOf, onRemove, onAdd, action }: TagRowTypes.Props) => {
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery("(min-width: 768px)");
  const items = [...selected.map((id) => ({ id, kind: "selected" as const })), ...suggestions.map((id) => ({ id, kind: "suggested" as const }))];
  const signature = items.map((item) => `${item.kind}:${item.id}`).join("|");
  const { rowRef, measureRef, fit } = useTagRowFit(items.length, signature);

  if (items.length === 0) return action ? <div className="tag-row-line">{action}</div> : null;
  const hidden = items.length - fit;

  const chip = (item: (typeof items)[number], measuring = false) => <TagRowChip key={item.id} id={item.id} kind={item.kind} label={labelOf(item.id)} measuring={measuring} onRemove={onRemove} onAdd={onAdd} />;
  const list = (
    <>
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
    </>
  );
  const more = (
    <Button variant="bare" className="tag-more" aria-expanded={open}>
      ще +{hidden}
    </Button>
  );

  return (
    <div className="tag-row-line">
      <div className="relative min-w-0 flex-1">
        <div ref={rowRef} className="tag-row" aria-label="Теги запиту">
          {items.slice(0, fit).map((item) => chip(item))}
          {hidden > 0 &&
            (desktop ? (
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>{more}</PopoverTrigger>
                <PopoverContent aria-label={TITLE} className="tag-panel">
                  {list}
                </PopoverContent>
              </Popover>
            ) : (
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>{more}</SheetTrigger>
                <SheetContent aria-describedby={undefined}>
                  <SheetTitle className="ui-sheet-title">{TITLE}</SheetTitle>
                  <SheetDescription className="sr-only">Теги, що вже на запиті, і ті, що можна додати.</SheetDescription>
                  <SheetBody className="tag-panel grid gap-3">{list}</SheetBody>
                </SheetContent>
              </Sheet>
            ))}
        </div>

        {/* Невидима копія рядка: по ній міряємо, скільки чипів влазить. */}
        <div ref={measureRef} aria-hidden className="tag-row tag-row-measure">
          {items.map((item) => chip(item, true))}
          <span className="tag-more" data-measure-more>
            ще +99
          </span>
        </div>
      </div>
      {action}
    </div>
  );
};
