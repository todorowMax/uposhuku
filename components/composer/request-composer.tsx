"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowRight, ArrowUp, Code2, ImageIcon, Paperclip, Plus } from "@/components/icons";
import { applyGlassPreference } from "@/lib/ui/glass";
import { setRequestTags } from "@/lib/map/request-tags";
import { setMapMode } from "@/lib/feed/map-requests";
import { Attachments, type Attachment } from "@/components/composer/attachments";
import { TagRow } from "@/components/composer/tag-row";
import { SpecialistFilters } from "@/components/composer/specialist-filters";
import { EMPTY_PARAMS, RequestParams, type RequestParamsValue } from "@/components/composer/request-params";
import { AuthPanel } from "@/components/auth/auth-panel";
import { RequestDock } from "@/components/requests/request-dock";
import { authFlowStore, requestsStore, sessionStore, showMyRequests } from "@/lib/auth/client";
import { offersCollapsedStore, useActiveRequest } from "@/lib/requests/offers";
import { useSidePanelOpen, useSidePanelWide } from "@/lib/requests/side-panel";
import { loadDraft, saveDraft } from "@/lib/requests/draft";
import type { PublishedRequest, RequestDraft } from "@/lib/requests/types";
import { useStore } from "@/lib/store";
import * as tagEngine from "@/lib/tags/engine";

/** Скільки файлів можна прикріпити до запиту. */
const MAX_FILES = 10;
/** Скільки сірих пропозицій показуємо поруч із тегами запиту. */
const MAX_SUGGESTIONS = 6;

/** Скільки рядків поле показує, перш ніж почати прокручуватися всередині. */
const MAX_ROWS = 5;

/**
 * Поле запиту над картою. Спершу компактне, як у асистента в ukoshiku:
 * один рядок, «+» ліворуч і маленька кнопка праворуч, карта під ним
 * майже вся видна. Коли людина натискає на поле, воно розкривається на
 * два поверхи: текст на всю ширину згори, дії знизу, і росте під текст
 * до п'яти рядків.
 *
 * «Знайти виконавців» публікує запит: гість вводить пошту й код з листа
 * (components/auth/auth-panel), хто увійшов — публікує одразу. Поки вхід
 * і збереження — заглушки (lib/auth/config.ts).
 */
export function RequestComposer() {
  const [text, setText] = useState("");
  const [inputPhase, setInputPhase] = useState<"closed" | "wide" | "opening" | "open" | "closing">("closed");
  const [narrowing, setNarrowing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  /** Теги, які людина прибрала: знову з тексту їх не додаємо. */
  const [dismissed, setDismissed] = useState<string[]>([]);
  /** Теги, додані з пропозицій одним кліком. */
  const [added, setAdded] = useState<string[]>([]);
  const [params, setParams] = useState<RequestParamsValue>(EMPTY_PARAMS);
  const authFlow = useStore(authFlowStore);
  const session = useStore(sessionStore);
  const requests = useStore(requestsStore);
  /**
   * Компактна панель активного запиту стоїть на місці поля, доки людина
   * не натисне «Новий запит». Карта й пропозиції відповідають активному запиту.
   */
  const activeRequest = useActiveRequest();
  const sidePanelOpen = useSidePanelOpen();
  const sidePanelWide = useSidePanelWide();
  const requestCount = session.status === "user" ? (requests?.length ?? 0) : 0;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<Attachment[]>([]);
  const phaseTimerRef = useRef<number | null>(null);
  filesRef.current = files;
  const wide = inputPhase !== "closed" && !narrowing;
  const expanded = inputPhase === "opening" || inputPhase === "open" || inputPhase === "closing";
  const actionsVisible = inputPhase === "open" || inputPhase === "opening";

  useEffect(() => () => {
    if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
  }, []);

  const clearPhaseTimer = () => {
    if (phaseTimerRef.current !== null) window.clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = null;
  };

  const openInput = () => {
    if (inputPhase === "open" || inputPhase === "opening") return;
    clearPhaseTimer();
    setNarrowing(false);
    if (inputPhase === "closing") {
      setInputPhase("open");
      return;
    }
    setInputPhase("wide");
    phaseTimerRef.current = window.setTimeout(() => {
      setInputPhase("opening");
      phaseTimerRef.current = window.setTimeout(() => {
        setInputPhase("open");
        phaseTimerRef.current = null;
      }, 680);
    }, inputPhase === "closed" ? 240 : 0);
  };

  const closeInput = () => {
    if (inputPhase === "closed" || inputPhase === "closing" || text.trim() !== "" || files.length > 0) return;
    clearPhaseTimer();
    if (inputPhase === "wide") {
      setInputPhase("closed");
      return;
    }
    setMenuOpen(false);
    setInputPhase("closing");
    setNarrowing(false);
    phaseTimerRef.current = window.setTimeout(() => {
      setNarrowing(true);
      phaseTimerRef.current = window.setTimeout(() => {
        setInputPhase("closed");
        setNarrowing(false);
        phaseTimerRef.current = null;
      }, 380);
    }, 300);
  };

  useEffect(() => {
    if (inputPhase === "closed") return;
    const onPointer = (event: PointerEvent) => {
      if (!formRef.current?.contains(event.target as Node)) closeInput();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [inputPhase, text, files]);

  // Порожнє поле — чистий аркуш: прибрані й додані теги забуваємо.
  useEffect(() => {
    if (text.trim() !== "") return;
    setDismissed([]);
    setAdded([]);
  }, [text]);

  const mentions = useMemo(
    () => tagEngine.detectTagMentions(text).filter((mention) => !dismissed.includes(mention.tagId)),
    [text, dismissed]
  );
  const selected = useMemo(
    () => [...new Set([...mentions.map((mention) => mention.tagId), ...added])].filter((id) => !dismissed.includes(id)),
    [mentions, added, dismissed]
  );
  const suggestions = useMemo(
    () =>
      tagEngine.suggestTags(selected, { exclude: dismissed, limit: MAX_SUGGESTIONS }).map((suggestion) => suggestion.tagId),
    [selected, dismissed]
  );

  // Карта відсіює виконавців за тегами запиту. Із затримкою: поки слово
  // недописане, тег може з'явитися й зникнути, а карта не має смикатися.
  const activeTags = activeRequest?.status === "open" ? activeRequest.tags.map((tag) => tag.id).join(",") : "";
  useEffect(() => {
    const tags = activeRequest ? (activeTags ? activeTags.split(",") : []) : selected;
    const timer = window.setTimeout(() => setRequestTags(tags), activeRequest ? 0 : 350);
    return () => window.clearTimeout(timer);
    // activeTags — рядок, щоб новий масив того самого запиту не перезапускав ефект.
  }, [selected, activeTags, Boolean(activeRequest)]);

  // Повернулися з Google з чернеткою: публікуємо її, як після коду з листа.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") !== "google") return;
    url.searchParams.delete("auth");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    if (loadDraft()?.pending) authFlowStore.set({ mode: "publish" });
  }, []);

  const removeTag = (id: string) => {
    setDismissed((current) => [...current, id]);
    setAdded((current) => current.filter((tag) => tag !== id));
  };
  const addTag = (id: string) => {
    setAdded((current) => [...current, id]);
    setDismissed((current) => current.filter((tag) => tag !== id));
  };

  // Прев'ю зображень живуть як blob-посилання: звільняємо, коли файл прибрали.
  useEffect(() => () => filesRef.current.forEach((item) => item.url && URL.revokeObjectURL(item.url)), []);
  const attach = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = "";
    setFiles((current) => [
      ...current,
      ...picked.slice(0, Math.max(0, MAX_FILES - current.length)).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      })),
    ]);
    openInput();
    inputRef.current?.focus();
  };
  const detach = (id: string) => {
    setFiles((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.url) URL.revokeObjectURL(item.url);
      return current.filter((entry) => entry.id !== id);
    });
  };

  /*
   * Висота під текст. Скидаємо в auto перед виміром, інакше scrollHeight
   * пам'ятає стару висоту й поле вміє лише рости. useLayoutEffect, щоб
   * нова висота потрапила в той самий кадр, що й символ.
   */
  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
    if (inputPhase === "closed" || inputPhase === "wide" || inputPhase === "closing") {
      textarea.style.height = `${lineHeight + 16}px`;
      textarea.style.overflowY = "hidden";
      textarea.scrollTop = 0;
      return;
    }
    textarea.style.height = "auto";
    // Під час розкриття CSS ще анімує відступи з 8+8 до 2+4 px.
    // Висота має одразу рахуватися за кінцевими 6 px, інакше наприкінці
    // вона зменшується, коли фаза змінюється з opening на open.
    const currentPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const finalPadding = 6;
    const natural = textarea.scrollHeight - currentPadding + finalPadding;
    const maxHeight = lineHeight * MAX_ROWS + finalPadding;
    textarea.style.height = `${Math.max(lineHeight * 2 + finalPadding, Math.min(natural, maxHeight))}px`;
    textarea.style.overflowY = natural > maxHeight ? "auto" : "hidden";
  }, [text, inputPhase]);

  // Скло під полем лише там, де розмиття не гальмує (lib/ui/glass.ts).
  useEffect(applyGlassPreference, []);

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

  /*
   * Чернетку кладемо в браузер до входу: після Google сторінка
   * перезавантажується, і без неї запит загубився б.
   */
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (text.trim().length < 3) {
      inputRef.current?.focus();
      return;
    }
    const draft: RequestDraft = {
      text: text.trim(),
      tags: selected.map((id) => ({ id, label: tagEngine.tagLabel(id) })),
      files: files.map(({ file }) => ({ name: file.name, size: file.size, type: file.type })),
      budget: params.budget,
      deadline: params.deadline,
      cityId: params.cityId,
    };
    saveDraft(draft, true);
    setMenuOpen(false);
    authFlowStore.set({ mode: "publish" });
  };

  const onPublished = (_request: PublishedRequest) => {
    setMapMode("performers");
    offersCollapsedStore.set(true);
    setText("");
    clearPhaseTimer();
    setInputPhase("closed");
    setNarrowing(false);
    setParams(EMPTY_PARAMS);
    setFiles((current) => {
      current.forEach((item) => item.url && URL.revokeObjectURL(item.url));
      return [];
    });
  };

  // Enter шукає, Shift+Enter переносить рядок, як у чатах.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (text.trim().length >= 3) submit();
    }
  };

  const pick = (kind: "file" | "image" | "code") => {
    setMenuOpen(false);
    if (kind === "file") fileInputRef.current?.click();
    else if (kind === "image") imageInputRef.current?.click();
    else inputRef.current?.focus();
  };

  const hasTray = files.length > 0 || selected.length > 0 || suggestions.length > 0;

  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const measure = () => {
      if (inputPhase === "closed" || inputPhase === "wide" || inputPhase === "closing") {
        form.style.height = "58px";
        return;
      }
      const trayHeight = form.querySelector<HTMLElement>(".composer-tray")?.offsetHeight ?? 0;
      // Беремо кінцеву висоту textarea й відступів, а не їхні проміжні
      // значення під час CSS-переходу: інакше контейнер змінює ціль на льоту.
      const fieldHeight = Number.parseFloat(inputRef.current?.style.height ?? "") || 40;
      const height = 12 + 10 + fieldHeight + 40 + 6 + (trayHeight ? trayHeight + 6 : 0);
      form.style.height = `${Math.max(58, Math.ceil(height))}px`;
    };
    measure();
    if (!expanded || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const selector of [".composer-tray", ".composer-field", ".composer-actions"]) {
      const element = form.querySelector(selector);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [inputPhase, expanded, text, files, selected, suggestions]);

  return (
    <div
      data-top-stack
      className={`pointer-events-none absolute inset-x-0 top-0 z-[var(--z-controls)] flex flex-col items-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] transition-[padding] duration-300 sm:pt-14 ${
        sidePanelOpen ? (sidePanelWide ? "lg:pr-[calc(min(50vw,760px)+36px)]" : "lg:pr-[428px]") : ""
      }`}
    >
      {activeRequest && requests && <RequestDock key={activeRequest.id} requests={requests} active={activeRequest} />}
      <form
        hidden={Boolean(activeRequest)}
        ref={formRef}
        onSubmit={submit}
        data-expanded={expanded}
        data-wide={wide}
        data-actions-visible={actionsVisible}
        data-phase={inputPhase}
        data-tray={expanded && hasTray}
        className="composer glass-panel pointer-events-auto relative w-full"
      >
        {expanded && hasTray && (
          <div className="composer-tray">
            <Attachments items={files} onRemove={detach} />
            <TagRow
              selected={selected}
              suggestions={suggestions}
              labelOf={tagEngine.tagLabel}
              onRemove={removeTag}
              onAdd={addTag}
            />
          </div>
        )}

        <label htmlFor="request" className="sr-only">
          Що потрібно створити?
        </label>
        <div className="composer-field">
          {/* Копія тексту під полем: підкреслює слова, з яких узяті теги. */}
          <div ref={mirrorRef} aria-hidden className="composer-input composer-mirror text-base leading-6">
            {highlight(text, mentions)}
          </div>
          <textarea
            id="request"
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={openInput}
            onKeyDown={onKeyDown}
            onScroll={(event) => {
              if (mirrorRef.current) mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
            }}
            rows={1}
            placeholder="Що потрібно створити?"
            className="composer-input relative resize-none bg-transparent text-base leading-6 text-ink outline-none placeholder:text-ink-muted/80"
          />
        </div>

        <input ref={fileInputRef} type="file" multiple hidden onChange={attach} />
        <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={attach} />

        {expanded && (
          <div className="composer-actions">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Додати файл, зображення або код"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              tabIndex={actionsVisible ? 0 : -1}
              className="composer-plus composer-action grid size-10 place-items-center rounded-xl text-ink-muted hover:bg-white/65 hover:text-ink aria-expanded:bg-white/65 aria-expanded:text-ink"
            >
              <Plus className={`size-5 transition-transform duration-200 ease-out ${menuOpen ? "rotate-45" : ""}`} />
            </button>
            <RequestParams value={params} onChange={setParams} />
            <button
              type="submit"
              tabIndex={actionsVisible ? 0 : -1}
              aria-label="Знайти виконавців"
              className="composer-send composer-action flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[15px] font-medium text-white hover:bg-[#ff8258] active:scale-[0.97]"
            >
              <span className="pl-1">Знайти виконавців</span>
              <ArrowRight className="size-4" />
            </button>
          </div>
        )}

        <span className="composer-compact-plus-wrap" style={{ position: "absolute", top: 8, left: 8, width: 40, height: 40 }}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Додати файл, зображення або код"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-hidden={expanded}
            tabIndex={expanded ? -1 : 0}
            className="composer-compact-plus grid size-10 place-items-center rounded-xl text-ink-muted hover:bg-white/65 hover:text-ink aria-expanded:bg-white/65 aria-expanded:text-ink"
            style={{ transform: inputPhase === "opening" || inputPhase === "open" ? "translateX(-48px)" : "translateX(0)" }}
          >
            <Plus className={`size-5 transition-transform duration-200 ease-out ${menuOpen ? "rotate-45" : ""}`} />
          </button>
        </span>

        <span className="composer-compact-send-wrap" style={{ position: "absolute", top: 8, right: 8, width: 40, height: 40 }}>
          <button
            type="button"
            aria-label="Розкрити чат"
            aria-hidden={expanded}
            tabIndex={expanded ? -1 : 0}
            onClick={() => { inputRef.current?.focus(); openInput(); }}
            className="composer-compact-send flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white hover:bg-[#ff8258]"
            style={{ transform: inputPhase === "opening" || inputPhase === "open" ? "translateX(48px)" : "translateX(0)" }}
          >
            <ArrowUp className="size-[18px]" />
          </button>
        </span>

        {menuOpen && (
          <div
            role="menu"
            className="composer-menu glass-panel absolute top-[calc(100%+8px)] left-0 z-10 w-64 rounded-2xl p-1.5"
          >
            <MenuItem icon={<Paperclip className="size-4" />} onClick={() => pick("file")}>
              Прикріпити файл
            </MenuItem>
            <MenuItem icon={<ImageIcon className="size-4" />} onClick={() => pick("image")}>
              Додати зображення
            </MenuItem>
            <MenuItem icon={<Code2 className="size-4" />} onClick={() => pick("code")}>
              Код або посилання на репозиторій
            </MenuItem>
          </div>
        )}
      </form>

      {authFlow ? (
        <AuthPanel key={authFlow.mode} onPublished={onPublished} />
      ) : !activeRequest ? (
        <SpecialistFilters
          expanded={wide}
          myRequests={requestCount > 0 ? { count: requestCount, onOpen: showMyRequests } : null}
        />
      ) : null}
    </div>
  );
}

/** Текст із підкресленими згадками тегів; кінцевий перенос рядка, як у textarea. */
function highlight(text: string, mentions: { start: number; end: number }[]): ReactNode[] {
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
