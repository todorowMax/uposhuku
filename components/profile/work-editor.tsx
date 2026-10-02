"use client";

import { useEffect } from "react";
import { Trash2 } from "lucide-react";
import { TagChips } from "@/components/profile/tag-chips";
import { TaggedField } from "@/components/profile/tagged-field";
import { useTagging } from "@/lib/tags/use-tagging";
import { PROFILE_LIMITS, type ProfileWork } from "@/lib/profile/types";

/**
 * Одна робота: назва, що зроблено, посилання. Теги розбираємо з назви й
 * опису самі, як для запиту: що ви розповіли про проєкт, те й підтверджує
 * ваші навички в профілі.
 */
export function WorkEditor({
  work,
  index,
  onChange,
  onRemove,
}: {
  work: ProfileWork;
  index: number;
  /** Часткове оновлення: зливається з актуальним станом роботи, а не з копією в замиканні. */
  onChange: (patch: Partial<ProfileWork>) => void;
  onRemove: () => void;
}) {
  // Назва й опис — один текст для тегів; підкреслюємо лише в описі.
  const titleLength = work.title.length + 1;
  const tagging = useTagging(`${work.title}\n${work.description}`, work.tags, 6);
  const descriptionMentions = tagging.mentions
    .filter((mention) => mention.start >= titleLength)
    .map((mention) => ({ ...mention, start: mention.start - titleLength, end: mention.end - titleLength }));

  const joined = tagging.tags.join(",");
  useEffect(() => {
    if (joined !== work.tags.join(",")) onChange({ tags: joined ? joined.split(",") : [] });
    // work міняється разом із тегами, інакше ефект би гнався за власним оновленням.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined]);

  const id = `work-${work.id}`;
  return (
    <fieldset className="pe-work">
      <legend className="sr-only">Робота {index + 1}</legend>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-title`} className="pe-label">
            Робота {index + 1}
          </label>
          <input
            id={`${id}-title`}
            value={work.title}
            maxLength={PROFILE_LIMITS.workTitle}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="Назва: Бот запису до барбера"
            className="auth-input w-full"
          />
        </div>
        <button type="button" onClick={onRemove} aria-label={`Видалити роботу ${index + 1}`} className="auth-icon-button mt-6 shrink-0">
          <Trash2 className="size-4" strokeWidth={1.9} />
        </button>
      </div>

      <label htmlFor={`${id}-description`} className="pe-label mt-3">
        Що зроблено, для кого, чим
      </label>
      <div className="pe-textbox">
        <TaggedField
          id={`${id}-description`}
          value={work.description}
          onChange={(description) => onChange({ description })}
          mentions={descriptionMentions}
          maxLength={PROFILE_LIMITS.workDescription}
          minRows={3}
          placeholder="Зробив Telegram-бот для запису клієнтів барбершопу: вибір майстра, нагадування, оплата Monobank. n8n і Google Sheets."
        />
      </div>
      <p className="pe-counter">
        {work.description.length}/{PROFILE_LIMITS.workDescription}
      </p>

      <label htmlFor={`${id}-url`} className="pe-label mt-2">
        Посилання на проєкт <span className="font-normal text-ink-muted">(необов'язково)</span>
      </label>
      <input
        id={`${id}-url`}
        value={work.url}
        maxLength={PROFILE_LIMITS.url}
        onChange={(event) => onChange({ url: event.target.value })}
        inputMode="url"
        placeholder="https://"
        className="auth-input w-full"
        aria-invalid={Boolean(work.url) && !/^https?:\/\//i.test(work.url) ? true : undefined}
      />

      <div className="mt-3">
        <TagChips
          tags={tagging.tags}
          suggestions={tagging.suggestions}
          labelOf={tagging.labelOf}
          onRemove={tagging.remove}
          onAdd={tagging.add}
          emptyHint="Опишіть, що зроблено, і ми самі знайдемо теги цієї роботи."
        />
      </div>
    </fieldset>
  );
}
