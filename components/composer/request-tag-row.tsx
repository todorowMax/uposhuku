"use client";

// components/composer/request-tag-row.tsx
//
// Рядок тегів запиту з кнопкою «+ Додати тег»: чипи з `tag-row.tsx` і вибір із `tag-picker.tsx`.
// Однаковий для поля нового запиту й екрана правки.

import { TagRow } from "@/components/composer/tag-row";
import { MAX_MANUAL_TAGS, type RequestTagsTypes } from "@/components/composer/use-request-tags";
import { TagPicker } from "@/components/tags/tag-picker";
import { proposeTag } from "@/lib/tags/proposals-client";
import { tagLabel } from "@/lib/tags/engine";

export namespace RequestTagRowTypes {
  export type Props = {
    tags: RequestTagsTypes.State;
    /** Увійшла людина: лише вона може запропонувати тег, якого нема в словнику. */
    canPropose: boolean;
  };
}

export const RequestTagRow = ({ tags, canPropose }: RequestTagRowTypes.Props) => (
  <TagRow
    selected={tags.selected}
    suggestions={tags.suggestions}
    labelOf={tagLabel}
    onRemove={tags.removeTag}
    onAdd={tags.addTag}
    action={
      <TagPicker
        context="request"
        title="Теги запиту"
        selected={tags.selected}
        suggestions={tags.suggestions}
        labelOf={tagLabel}
        onToggle={tags.toggleTag}
        onPropose={canPropose ? (value) => proposeTag(value, "request") : undefined}
        limitReached={tags.manualFull}
        limitHint={`Вручну можна додати до ${MAX_MANUAL_TAGS} тегів. Теги з тексту в цей ліміт не входять.`}
      />
    }
  />
);
