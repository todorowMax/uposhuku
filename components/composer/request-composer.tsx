"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowRight, ArrowUp } from "@/components/icons";
import { applyGlassPreference } from "@/lib/ui/glass";
import { setRequestTags } from "@/lib/map/request-tags";
import { setMapMode } from "@/lib/feed/map-requests";
import { Attachments } from "@/components/composer/attachments";
import { FilePickerButton } from "@/components/composer/file-picker-button";
import { RequestTagRow } from "@/components/composer/request-tag-row";
import { useRequestFiles } from "@/components/composer/use-request-files";
import { useRequestTags } from "@/components/composer/use-request-tags";
import { SpecialistFilters } from "@/components/composer/specialist-filters";
import { EMPTY_PARAMS, RequestParams, type RequestParamsValue } from "@/components/composer/request-params";
import { AuthPanel } from "@/components/auth/auth-panel";
import { RequestDock } from "@/components/requests/request-dock";
import { RestoreNotice } from "@/components/requests/restore-notice";
import { authFlowStore, requestsStore, sessionStore, showMyRequests } from "@/lib/auth/client";
import { offersCollapsedStore, useActiveRequest } from "@/lib/requests/offers";
import { useSidePanelOpen, useSidePanelWide } from "@/lib/requests/side-panel";
import { loadDraft, saveDraft } from "@/lib/requests/draft";
import type { PublishedRequest, RequestDraft } from "@/lib/requests/types";
import { useStore } from "@/lib/store";
import * as tagEngine from "@/lib/tags/engine";
import { EVENTS, track } from "@/lib/telemetry/track";
import { useProposeTarget } from "./use-propose-target";

/** Скільки рядків поле показує, перш ніж почати прокручуватися всередині. */
const MAX_ROWS = 5;

/**
 * Поле запиту над картою. Спершу компактне, як у асистента в ukoshiku:
 * один рядок і маленька кнопка праворуч, карта під ним майже вся видна.
 * Коли людина натискає на поле, воно розкривається на два поверхи: текст
 * на всю ширину згори, дії знизу, і росте під текст до п'яти рядків.
 * Файли (скріпка в нижньому ряду) лише для тих, хто увійшов: вони вантажаться в R2 одразу після вибору,
 * а в чернетку йдуть їхні id (components/composer/use-request-files, app/api/request-files).
 *
 * «Знайти виконавців» публікує запит: гість вводить пошту й код з листа
 * (components/auth/auth-panel), хто увійшов — публікує одразу. Поки вхід
 * і збереження — заглушки (lib/auth/config.ts).
 */
export function RequestComposer() {
  const [text, setText] = useState("");
  const [inputPhase, setInputPhase] = useState<"closed" | "wide" | "opening" | "open" | "closing">("closed");
  const [narrowing, setNarrowing] = useState(false);
  const [params, setParams] = useState<RequestParamsValue>(EMPTY_PARAMS);
  const tags = useRequestTags(text);
  const files = useRequestFiles();
  const { mentions, selected, suggestions } = tags;
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
  const phaseTimerRef = useRef<number | null>(null);
  const focusTracked = useRef(false);
  const tagsTracked = useRef(false);
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
    if (!focusTracked.current) {
      focusTracked.current = true;
      track(EVENTS.composerFocused);
    }
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

  const proposeLabel = useProposeTarget(inputPhase, () => {
    openInput();
    inputRef.current?.focus();
  });

  const closeInput = () => {
    if (inputPhase === "closed" || inputPhase === "closing" || text.trim() !== "" || files.items.length > 0) return;
    clearPhaseTimer();
    if (inputPhase === "wide") {
      setInputPhase("closed");
      return;
    }
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
      const target = event.target as Element;
      // Вибір тегу відкривається поза формою (портал), але це ще наше поле.
      if (target.closest?.('[data-slot="popover-content"], [data-slot="sheet-content"]')) return;
      if (!formRef.current?.contains(target)) closeInput();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [inputPhase, text, files.items.length]);

  // Порожнє поле — чистий аркуш: прибрані й додані теги забуваємо.
  const resetTags = tags.reset;
  useEffect(() => {
    if (text.trim() === "") resetTags();
  }, [text, resetTags]);

  // Перший раз, коли з тексту з'явився тег: чи розуміє словник, що пишуть люди.
  useEffect(() => {
    if (tagsTracked.current || mentions.length === 0) return;
    tagsTracked.current = true;
    track(EVENTS.composerTagsDetected, { tags: mentions.length });
  }, [mentions]);

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
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (loadDraft()?.pending) authFlowStore.set({ mode: "publish" });
  }, []);

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
    // Запит з файлами, що ще вантажаться, пішов би без них.
    if (files.busy) return;
    const draft: RequestDraft = {
      text: text.trim(),
      tags: selected.map((id) => ({ id, label: tagEngine.tagLabel(id) })),
      files: files.files.map(({ id }) => ({ id })),
      budget: params.budget,
      deadline: params.deadline,
      deadlineDate: params.deadlineDate,
      cityId: params.cityId,
      channelOptIn: params.channel,
    };
    saveDraft(draft, true);
    track(EVENTS.requestSubmitClicked, { tags: draft.tags.length, has_budget: Boolean(draft.budget), has_city: Boolean(draft.cityId), files: draft.files.length });
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
    files.reset();
  };

  // Enter шукає, Shift+Enter переносить рядок, як у чатах.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (text.trim().length >= 3) submit();
    }
  };

  // Навіть коли тегів ще нема, під текстом стоїть «+ Додати тег».
  const hasTray = selected.length > 0 || suggestions.length > 0 || text.trim() !== "" || files.items.length > 0;

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
      // Ряд дій на телефоні двоповерховий (чипи, потім «+» і «Знайти»): беремо справжню висоту, а не 40px.
      const actionsHeight = Math.max(40, form.querySelector<HTMLElement>(".composer-actions")?.offsetHeight ?? 40);
      const height = 12 + 10 + fieldHeight + actionsHeight + 6 + (trayHeight ? trayHeight + 6 : 0);
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
  }, [inputPhase, expanded, text, selected, suggestions, files.items, files.notice]);

  return (
    <div
      data-top-stack
      className={`pointer-events-none absolute inset-x-0 top-0 z-[var(--z-controls)] flex flex-col items-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] transition-[padding] duration-300 sm:pt-14 ${
        sidePanelOpen ? (sidePanelWide ? "lg:pr-[calc(min(50vw,760px)+36px)]" : "lg:pr-[428px]") : ""
      }`}
    >
      <RestoreNotice />
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
            <Attachments items={files.items} notice={files.notice} onRemove={files.remove} />
            <RequestTagRow tags={tags} canPropose={session.status === "user"} />
          </div>
        )}

        <label htmlFor="request" className="sr-only">
          {proposeLabel ?? "Що потрібно створити?"}
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
            placeholder={proposeLabel ?? "Що потрібно створити?"}
            className="composer-input relative resize-none bg-transparent text-base leading-6 text-ink outline-none placeholder:text-ink-muted/80"
          />
        </div>

        {expanded && (
          <div className="composer-actions">
            {session.status === "user" && <FilePickerButton onPick={files.pick} tabIndex={actionsVisible ? 0 : -1} />}
            <RequestParams value={params} onChange={setParams} />
            <button
              type="submit"
              tabIndex={actionsVisible ? 0 : -1}
              disabled={files.busy}
              aria-label="Знайти виконавців"
              className="composer-send composer-action flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--brand-solid)] px-4 text-[15px] font-medium text-white hover:bg-[var(--brand-solid-hover)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
            >
              <span className="pl-1">Знайти виконавців</span>
              <ArrowRight className="size-4" />
            </button>
          </div>
        )}

        <span className="composer-compact-send-wrap" style={{ position: "absolute", top: 8, right: 8, width: 40, height: 40 }}>
          <button
            type="button"
            aria-label="Описати задачу"
            aria-hidden={expanded}
            tabIndex={expanded ? -1 : 0}
            onClick={() => { inputRef.current?.focus(); openInput(); }}
            className="composer-compact-send flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-solid)] text-white hover:bg-[var(--brand-solid-hover)]"
            style={{ transform: inputPhase === "opening" || inputPhase === "open" ? "translateX(48px)" : "translateX(0)" }}
          >
            <ArrowUp className="size-[18px]" />
          </button>
        </span>
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
