"use client";

// Чип тегу в рядку над текстом запиту: вибраний (з хрестиком) або сірий із «+». `measuring` робить копію для виміру ширини.

import { Plus, X } from "@/components/icons";
import { Button } from "@/components/ui/button";

export namespace TagRowChipTypes {
  export type Props = {
    id: string;
    kind: "selected" | "suggested";
    label: string;
    measuring?: boolean;
    onRemove: (id: string) => void;
    onAdd: (id: string) => void;
  };
}

export const TagRowChip = ({ id, kind, label, measuring = false, onRemove, onAdd }: TagRowChipTypes.Props) => {
  const measure = measuring ? { "data-measure-chip": "" } : {};
  if (kind === "selected") {
    return (
      <span className="tag-chip" data-kind="selected" title={label} {...measure}>
        <span className="tag-chip-label">{label}</span>
        <Button variant="bare" tabIndex={measuring ? -1 : 0} onClick={() => onRemove(id)} aria-label={`Прибрати тег «${label}»`} className="tag-chip-remove">
          <X className="size-3" />
        </Button>
      </span>
    );
  }
  return (
    <Button variant="bare" tabIndex={measuring ? -1 : 0} onClick={() => onAdd(id)} className="tag-chip" data-kind="suggested" aria-label={`Додати тег «${label}»`} title={label} {...measure}>
      <Plus className="size-3 shrink-0" />
      <span className="tag-chip-label">{label}</span>
    </Button>
  );
};
