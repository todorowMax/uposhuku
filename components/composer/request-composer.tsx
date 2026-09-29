"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowRight, ArrowUp, Code2, ImageIcon, Paperclip, Plus } from "lucide-react";

/** Скільки рядків поле показує, перш ніж почати прокручуватися всередині. */
const MAX_ROWS = 5;

/**
 * Поле запиту над картою. Спершу компактне, як у асистента в ukoshiku:
 * один рядок, «+» ліворуч і маленька кнопка праворуч, карта під ним
 * майже вся видна. Щойно людина починає писати, поле розкривається на
 * два поверхи: текст на всю ширину згори, дії знизу, і росте під текст
 * до п'яти рядків.
 *
 * Поки лише вигляд для прев'ю: відправка нікуди не йде.
 */
export function RequestComposer() {
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const expanded = text.trim() !== "";

  /*
   * Висота під текст. Скидаємо в auto перед виміром, інакше scrollHeight
   * пам'ятає стару висоту й поле вміє лише рости. useLayoutEffect, щоб
   * нова висота потрапила в той самий кадр, що й символ.
   */
  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    if (!expanded) {
      textarea.style.removeProperty("height");
      textarea.style.overflowY = "hidden";
      textarea.scrollTop = 0;
      return;
    }
    textarea.style.height = "auto";
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
    const padding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const maxHeight = lineHeight * MAX_ROWS + padding;
    const natural = textarea.scrollHeight;
    textarea.style.height = `${Math.min(natural, maxHeight)}px`;
    textarea.style.overflowY = natural > maxHeight ? "auto" : "hidden";
  }, [text, expanded]);

  // Меню закривається кліком повз нього і Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!formRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    inputRef.current?.focus();
  };

  // Enter шукає, Shift+Enter переносить рядок, як у чатах.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (expanded) submit();
    }
  };

  const pick = () => {
    setMenuOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[var(--z-controls)] flex flex-col items-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] sm:pt-14">
      <form
        ref={formRef}
        onSubmit={submit}
        data-expanded={expanded}
        className="composer glass-panel pointer-events-auto relative w-full"
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
          rows={1}
          placeholder="Що потрібно створити?"
          className="composer-input resize-none bg-transparent text-base leading-6 text-ink outline-none placeholder:text-ink-muted/80"
        />

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Додати файл, зображення або код"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="composer-plus grid size-10 place-items-center rounded-xl text-ink-muted transition-[color,background-color,transform] duration-150 hover:bg-white/65 hover:text-ink active:scale-[0.97] aria-expanded:bg-white/65 aria-expanded:text-ink"
        >
          <Plus
            className={`size-5 transition-transform duration-200 ease-out ${menuOpen ? "rotate-45" : ""}`}
            strokeWidth={2.1}
          />
        </button>

        <button
          type="submit"
          disabled={!expanded}
          aria-label="Знайти виконавців"
          className="composer-send flex h-10 items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-medium text-brand-ink transition-[transform,background-color,opacity] duration-150 ease-out hover:bg-[#4c5558] active:scale-[0.97] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-brand"
        >
          {expanded ? (
            <>
              <span className="pl-1">Знайти виконавців</span>
              <ArrowRight className="size-4" strokeWidth={2.2} />
            </>
          ) : (
            <ArrowUp className="size-[18px]" strokeWidth={2.4} />
          )}
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="composer-menu glass-panel absolute top-[calc(100%+8px)] left-0 z-10 w-64 rounded-2xl p-1.5"
          >
            <MenuItem icon={<Paperclip className="size-4" strokeWidth={1.9} />} onClick={pick}>
              Прикріпити файл
            </MenuItem>
            <MenuItem icon={<ImageIcon className="size-4" strokeWidth={1.9} />} onClick={pick}>
              Додати зображення
            </MenuItem>
            <MenuItem icon={<Code2 className="size-4" strokeWidth={1.9} />} onClick={pick}>
              Код або посилання на репозиторій
            </MenuItem>
          </div>
        )}
      </form>

    </div>
  );
}

function MenuItem({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-white/65"
    >
      <span className="text-ink-muted">{icon}</span>
      {children}
    </button>
  );
}
