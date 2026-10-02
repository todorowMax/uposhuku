"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Текст із підкресленими згадками тегів; кінцевий перенос рядка, як у textarea. */
const highlight = (text: string, mentions: { start: number; end: number }[]): ReactNode[] => {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const mention of mentions) {
    if (mention.start < cursor) continue;
    parts.push(text.slice(cursor, mention.start));
    parts.push(
      <mark key={mention.start} className="composer-mention">
        {text.slice(mention.start, mention.end)}
      </mark>
    );
    cursor = mention.end;
  }
  parts.push(text.slice(cursor));
  if (text.endsWith("\n")) parts.push(" ");
  return parts;
};

/**
 * Багаторядкове поле, у якому слова, з яких взято теги, підкреслені, як у
 * полі запиту. Росте під текст, але не нижче minRows.
 */
export function TaggedField({
  id,
  value,
  onChange,
  mentions,
  placeholder,
  maxLength,
  minRows = 3,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  mentions: { start: number; end: number }[];
  placeholder?: string;
  maxLength: number;
  minRows?: number;
  describedBy?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight) || 22;
    const padding = Number.parseFloat(getComputedStyle(input).paddingTop) + Number.parseFloat(getComputedStyle(input).paddingBottom);
    input.style.height = `${Math.max(input.scrollHeight, lineHeight * minRows + padding)}px`;
  }, [value, minRows]);

  return (
    <div className="tf">
      <div ref={mirrorRef} aria-hidden className="tf-input tf-mirror">
        {highlight(value, mentions)}
      </div>
      <textarea
        id={id}
        ref={inputRef}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className="tf-input tf-textarea"
      />
    </div>
  );
}
