"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, Code2, ImageIcon, Paperclip } from "lucide-react";

/**
 * Поле запиту над картою, як на макеті: людина пише, що потрібно
 * створити, і шукає виконавців. Поки лише вигляд для прев'ю: відправка
 * нікуди не йде, логіку допишемо окремо.
 */
export function RequestComposer() {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    inputRef.current?.focus();
  };

  // Enter шукає, Shift+Enter переносить рядок, як у чатах.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[var(--z-controls)] flex flex-col items-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] sm:pt-16">
      <form
        onSubmit={submit}
        className="composer pointer-events-auto w-full max-w-[760px] rounded-[22px] bg-surface p-3 pl-5 ring-1 ring-line sm:p-4 sm:pl-6"
      >
        <label htmlFor="request" className="sr-only">
          Що потрібно створити?
        </label>
        <textarea
          id="request"
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Що потрібно створити?"
          className="field-sizing-content block max-h-40 min-h-14 w-full resize-none bg-transparent pt-1 text-base leading-relaxed text-ink outline-none placeholder:text-ink-muted/80 sm:text-lg"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="-ml-2 flex items-center">
            <ComposerTool label="Прикріпити файл">
              <Paperclip className="size-[18px]" strokeWidth={1.8} />
            </ComposerTool>
            <ComposerTool label="Додати зображення">
              <ImageIcon className="size-[18px]" strokeWidth={1.8} />
            </ComposerTool>
            <ComposerTool label="Вставити код або посилання на репозиторій">
              <Code2 className="size-[18px]" strokeWidth={1.8} />
            </ComposerTool>
          </div>
          <button
            type="submit"
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-medium text-brand-ink transition-[transform,background-color] duration-150 ease-out hover:bg-[oklch(0.48_0.2_264)] active:scale-[0.97] sm:h-12 sm:px-5"
          >
            Знайти виконавців
            <ArrowRight className="size-4" strokeWidth={2.2} />
          </button>
        </div>
      </form>

      <ul className="pointer-events-auto mt-3 flex items-center gap-5 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink">
        <li className="flex items-center gap-2">
          <span aria-hidden className="globe-legend-face" />
          Виконавці
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 rounded-full bg-brand ring-2 ring-surface" />
          Запити
        </li>
        <li className="hidden items-center gap-2 text-ink-muted sm:flex">
          Розмір фото — розміщення
        </li>
      </ul>
    </div>
  );
}

function ComposerTool({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-bg hover:text-ink"
    >
      {children}
    </button>
  );
}
