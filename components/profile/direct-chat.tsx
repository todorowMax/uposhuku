"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { gsap } from "gsap";
import { ArrowUp, Maximize2, Minimize2, ShieldCheck, X } from "lucide-react";
import { authFlowStore, sessionStore } from "@/lib/auth/client";
import { avatarBackground } from "@/lib/map/avatar-style";
import type { Performer } from "@/lib/map/types";
import { savePending, sendDirect, startDialog, useDialog, useTyping } from "@/lib/requests/direct-chat";
import { mentionsContacts } from "@/lib/requests/mock-chat";
import { REQUEST_TEXT_MAX, REQUEST_TEXT_MIN } from "@/lib/requests/types";
import { useStore } from "@/lib/store";

const TIME = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" });
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type View = "compose" | "chat";
const GAP = 16;
const BASE_WIDTH = 520;

/**
 * Куди стає панель: знизу по центру, над кнопкою. Чат вищий за поле, а в
 * розгорнутому вигляді росте вшир і ввись, лишаючись по центру. На телефоні
 * майже на весь екран.
 */
const rectFor = (view: View, expanded: boolean) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 640) {
    const height = view === "compose" ? Math.min(300, vh - 16) : vh - 16;
    return { left: 8, top: vh - height - 8, width: vw - 16, height };
  }
  const full = view === "chat" && expanded;
  const width = Math.min(full ? 820 : BASE_WIDTH, vw - GAP * 2);
  const height = view === "compose" ? 300 : full ? vh - GAP * 2 : Math.min(640, vh - GAP * 2);
  return { left: Math.round((vw - width) / 2), top: vh - GAP - height, width, height };
};

/**
 * Тёмна панель «Описати задачу» у профілі: розкривається з кнопки (GSAP),
 * спершу поле задачі, після відправки той самий блок стає чатом. Задача
 * висить угорі, поки виконавець не відповів. Чат можна розтягнути вшир і ввись.
 */
export function DirectChatPanel({
  performer,
  getOrigin,
  onClose,
  onLeaveToAuth,
}: {
  performer: Performer;
  /** Де зараз кнопка, з якої розкрилися; null — розкриваємось без кнопки. */
  getOrigin: () => DOMRect | null;
  onClose: () => void;
  /** Гість пішов входити: профіль треба закрити, щоб було видно панель входу. */
  onLeaveToAuth: () => void;
}) {
  const dialog = useDialog(performer.id);
  const typing = useTyping(performer.id);
  const session = useStore(sessionStore);
  const view: View = dialog ? "chat" : "compose";
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLFormElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const mountedRef = useRef(false);
  const firstName = performer.name.split(" ")[0];
  const warn = view === "chat" && mentionsContacts(text);

  // Розкриття з кнопки на монтуванні; далі, коли міняється вигляд чи ширина, панель пере-морфиться.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !body || !backdrop) return;
    const to = rectFor(view, expanded);
    if (!mountedRef.current) {
      mountedRef.current = true;
      const origin = getOrigin();
      if (reduced()) {
        gsap.set(panel, { ...to, borderRadius: 24 });
        inputRef.current?.focus();
        return;
      }
      const timeline = gsap.timeline({ onComplete: () => inputRef.current?.focus({ preventScroll: true }) });
      timeline.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" }, 0);
      if (origin) {
        timeline.fromTo(panel, { left: origin.left, top: origin.top, width: origin.width, height: origin.height, borderRadius: 14, opacity: 1 }, { ...to, borderRadius: 24, duration: 0.46, ease: "expo.out" }, 0);
      } else {
        timeline.fromTo(panel, { ...to, borderRadius: 24, opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.36, ease: "power3.out" }, 0);
      }
      timeline.fromTo(body, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.28, ease: "power2.out" }, 0.18);
      return () => {
        timeline.kill();
      };
    }
    if (reduced()) {
      gsap.set(panel, to);
      return;
    }
    gsap.to(panel, { ...to, duration: 0.42, ease: "expo.out", overwrite: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, expanded]);

  // Содержимое міняється разом із виглядом: плавно проявляємо нове.
  useLayoutEffect(() => {
    if (!bodyRef.current || !mountedRef.current || reduced()) return;
    const tween = gsap.fromTo(bodyRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.26, ease: "power2.out", delay: 0.12 });
    return () => {
      tween.kill();
    };
    // Перший показ веде розкриття.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Фон: затемнення лише поки пишемо задачу, у чаті профіль під панеллю лишається живим.
  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop || !mountedRef.current) return;
    gsap.to(backdrop, { opacity: view === "compose" ? 1 : 0, duration: 0.3, ease: "power2.out" });
  }, [view]);

  useEffect(() => {
    const onResize = () => panelRef.current && gsap.set(panelRef.current, rectFor(view, expanded));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [view, expanded]);

  const collapse = (after: () => void) => {
    const panel = panelRef.current;
    const body = bodyRef.current;
    const backdrop = backdropRef.current;
    if (closingRef.current) return;
    closingRef.current = true;
    if (!panel || !body || !backdrop || reduced()) {
      after();
      return;
    }
    const origin = getOrigin();
    const timeline = gsap.timeline({ onComplete: after });
    timeline.to(body, { opacity: 0, duration: 0.12, ease: "power1.in" }, 0).to(backdrop, { opacity: 0, duration: 0.25, ease: "power2.in" }, 0);
    if (origin) timeline.to(panel, { left: origin.left, top: origin.top, width: origin.width, height: origin.height, borderRadius: 14, duration: 0.34, ease: "expo.inOut", overwrite: "auto" }, 0.04);
    else timeline.to(panel, { opacity: 0, y: 24, duration: 0.24, ease: "power2.in" }, 0.04);
  };
  const close = () => collapse(onClose);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>("button, textarea")].filter((item) => !item.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Нове повідомлення чи «друкує»: прокручуємо до низу.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [dialog?.messages.length, typing, view]);

  // Після переходу в чат фокус лишається в полі, щоб можна було одразу писати далі.
  useEffect(() => {
    if (mountedRef.current) inputRef.current?.focus({ preventScroll: true });
  }, [view]);

  const ready = text.trim().length >= REQUEST_TEXT_MIN || (view === "chat" && text.trim().length > 0);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!ready) {
      inputRef.current?.focus();
      return;
    }
    if (view === "chat") {
      sendDirect(performer.id, value);
      setText("");
      return;
    }
    if (session.status === "user") {
      startDialog(performer.id, value);
      setText("");
      return;
    }
    // Гість: задача чекає, поки він увійде, і чат відкриється сам (DirectChatSync).
    savePending(performer.id, value);
    collapse(() => {
      onLeaveToAuth();
      authFlowStore.set({ mode: "login" });
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const [task, ...rest] = dialog?.messages ?? [];

  return (
    <>
      <div ref={backdropRef} className="dr-backdrop" data-active={view === "compose" || undefined} onClick={view === "compose" ? close : undefined} aria-hidden />
      <div ref={panelRef} role="dialog" aria-modal="false" aria-label={view === "chat" ? `Чат з ${performer.name}` : `Задача для ${performer.name}`} className="dr-panel" data-view={view}>
        <form ref={bodyRef} onSubmit={submit} className="dr-body">
          <header className="dr-header">
            {view === "chat" && <span className="dr-avatar" style={avatarBackground(performer)} aria-hidden />}
            <div className="min-w-0 flex-1">
              {view === "chat" ? (
                <>
                  <p className="dr-title truncate">
                    <span>{performer.name}</span>
                  </p>
                  <p className="dr-sub">{typing ? "друкує…" : dialog?.status === "waiting" ? "Очікує відповіді" : performer.specialty}</p>
                </>
              ) : (
                <p className="dr-title">
                  Задача для <span>{firstName}</span>
                </p>
              )}
            </div>
            {view === "chat" && (
              <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Згорнути чат" : "Розгорнути чат"} aria-pressed={expanded} className="dr-close max-sm:hidden">
                {expanded ? <Minimize2 className="size-4" strokeWidth={2} /> : <Maximize2 className="size-4" strokeWidth={2} />}
              </button>
            )}
            <button type="button" onClick={close} aria-label="Закрити" className="dr-close">
              <X className="size-4" strokeWidth={2.2} />
            </button>
          </header>

          {view === "chat" && task && (
            <div ref={listRef} className="dm-scroll" aria-live="polite">
              <article className="dm-task" aria-label="Ваша задача">
                <p className="dm-task-label">Ваша задача</p>
                <p className="dm-task-text">{task.text}</p>
                <p className="dm-task-status" data-waiting={dialog?.status === "waiting" || undefined}>
                  <span className="dm-dot" />
                  {dialog?.status === "waiting" ? `Очікуємо відповіді від ${firstName}` : "Виконавець відповів у чаті"}
                </p>
              </article>
              <p className="dm-notice">
                <ShieldCheck className="size-3.5 shrink-0" strokeWidth={2} />
                Домовляйтеся тут: якщо щось піде не так, ми побачимо переписку й допоможемо.
              </p>
              {rest.map((message) => (
                <div key={message.id} className="dm-bubble" data-from={message.from}>
                  <p>{message.text}</p>
                  <time dateTime={message.at}>{TIME.format(new Date(message.at))}</time>
                </div>
              ))}
              {typing && (
                <div className="dm-bubble dm-typing" data-from="them" aria-label="Виконавець друкує">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          )}

          {warn && (
            <p role="status" className="dm-warn">
              Домовляйтеся поза чатом на свій ризик: якщо щось піде не так, домовленостей ми не побачимо.
            </p>
          )}

          <label htmlFor="dr-text" className="sr-only">
            {view === "chat" ? "Повідомлення" : "Що потрібно зробити"}
          </label>
          {view === "compose" ? (
            <textarea
              id="dr-text"
              ref={inputRef}
              value={text}
              maxLength={REQUEST_TEXT_MAX}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Опишіть, що потрібно зробити. ${firstName} побачить це першою.`}
              className="dr-input"
            />
          ) : null}
          {view === "compose" ? (
            <footer className="dr-footer">
              <p className="dr-hint">Enter відправляє, Shift+Enter переносить рядок</p>
              <button type="submit" disabled={!ready} className="dr-send">
                Надіслати
                <ArrowUp className="size-4" strokeWidth={2.4} />
              </button>
            </footer>
          ) : (
            <div className="dm-input-row">
              <textarea id="dr-text" ref={inputRef} rows={1} value={text} maxLength={REQUEST_TEXT_MAX} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} placeholder="Повідомлення" className="dm-input" />
              <button type="submit" disabled={!ready} aria-label="Надіслати" className="dm-send">
                <ArrowUp className="size-4" strokeWidth={2.4} />
              </button>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
