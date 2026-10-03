"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { Check, ChevronDown, ChevronUp, MoreHorizontal, Paperclip, Plus } from "lucide-react";
import { ApiError, activeRequestStore, closeActiveRequest, composingStore } from "@/lib/auth/client";
import { tagMatches, useStore } from "@/lib/map/filters";
import { sidePanelChoice } from "@/lib/requests/side-panel";
import { requestFacts } from "@/lib/requests/format";
import { useDeals } from "@/lib/deals/client";
import { dealPhase, type DealPhase } from "@/lib/deals/machine";
import { dockCompactStore, loadDockCompact, offersCollapsedStore, offersCountStore, setDockCompact } from "@/lib/requests/offers";
import type { PublishedRequest } from "@/lib/requests/types";

const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * Шлях запиту від публікації до готової роботи. Поки є лише перші два
 * кроки: відгуки, вибір і угода з'являться разом із чатом і оплатою.
 */
const STEPS = ["Опубліковано", "Відгуки", "Вибір виконавця", "Угода", "Готово"] as const;

/** «1 виконавець», «3 виконавці», «15 виконавців». */
const performersCount = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return `${count} виконавець`;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${count} виконавці`;
  return `${count} виконавців`;
};

/** На якому кроці запит: без відгуків чекаємо їх, з відгуками — вибір виконавця. */
const stepOf = (request: PublishedRequest, offers: number, deal: DealPhase) =>
  request.status === "closed" ? -1 : deal === "done" ? 5 : deal === "working" ? 3 : offers > 0 ? 2 : 1;

/** «1 пропозиція», «3 пропозиції», «7 пропозицій». */
const offersCount = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return `${count} пропозиція`;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${count} пропозиції`;
  return `${count} пропозицій`;
};

/**
 * Опублікований запит стоїть на місці поля запиту: текст, теги, кроки й що
 * зараз відбувається. Поле знову з'являється за «Новий запит». Коли
 * запитів два й більше, знизу «Усі запити» розгортають список.
 */
export function RequestDock({ requests, active }: { requests: PublishedRequest[]; active: PublishedRequest }) {
  const matches = useStore(tagMatches);
  const offers = useStore(offersCountStore);
  const compact = useStore(dockCompactStore);
  const [listOpen, setListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deals = useDeals(active.id);
  const phase = dealPhase(deals);
  const current = stepOf(active, offers, phase);
  const closed = active.status === "closed";
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(loadDockCompact, []);

  // Поле запиту ніби стискається в картку, картка — у смужку й назад.
  useLayoutEffect(() => {
    if (!cardRef.current || reduced()) return;
    const tween = gsap.fromTo(cardRef.current, { opacity: 0, y: -8, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power3.out" });
    return () => {
      tween.kill();
    };
  }, [compact]);

  // Смуга прогресу доїжджає до поточного кроку щоразу, як міняється запит.
  useLayoutEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;
    const progress = current <= 0 ? 0 : Math.min(1, current / (STEPS.length - 1));
    if (reduced()) {
      gsap.set(fill, { scaleX: progress });
      return;
    }
    const tween = gsap.fromTo(fill, { scaleX: 0 }, { scaleX: progress, duration: 0.7, delay: 0.15, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [active.id, current]);

  useLayoutEffect(() => {
    if (!listOpen || !listRef.current || reduced()) return;
    const tween = gsap.fromTo(listRef.current, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.28, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [listOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  const close = async () => {
    setMenuOpen(false);
    setClosing(true);
    setError(null);
    try {
      await closeActiveRequest(active.id);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося закрити запит.");
    } finally {
      setClosing(false);
    }
  };

  if (compact) {
    return (
      <section ref={cardRef} aria-label="Ваш запит" className="request-pill glass-panel" data-closed={closed || undefined}>
        <button type="button" onClick={() => setDockCompact(false)} aria-expanded={false} className="request-pill-button">
          <span className="my-request-status shrink-0" role="img" aria-label={closed ? "Закритий" : "Відкритий"} />
          <span className="min-w-0 flex-1 truncate text-left text-[14px] text-ink">{active.text}</span>
          <span aria-hidden className="request-mini-steps">
            {STEPS.map((label, index) => (
              <span key={label} data-state={closed ? "idle" : index < current ? "done" : index === current ? "current" : "idle"} />
            ))}
          </span>
          <span className="hidden shrink-0 text-[12px] font-medium text-ink sm:inline">{closed ? "Закрито" : STEPS[Math.min(STEPS.length - 1, Math.max(0, current))]}</span>
          {offers > 0 && <span className="filter-all-badge shrink-0">{offers}</span>}
          <ChevronDown className="size-4 shrink-0 text-ink-muted" strokeWidth={2} />
          <span className="sr-only">Розгорнути запит</span>
        </button>
      </section>
    );
  }

  const shownTags = active.tags.slice(0, 5);
  const others = requests.filter((request) => request.id !== active.id);
  const seen = matches?.size;

  return (
    <section ref={cardRef} aria-label="Ваш запит" className="request-dock glass-panel" data-closed={closed || undefined}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-muted">
          <span className="my-request-status">{closed ? "Закритий" : "Відкритий"}</span>
          <span aria-hidden>·</span>
          <time dateTime={active.createdAt} className="truncate">
            {DATE.format(new Date(active.createdAt))}
          </time>
        </div>
        <div className="flex items-center">
        <button type="button" onClick={() => setDockCompact(true)} aria-label="Згорнути запит" title="Згорнути" className="auth-icon-button">
          <ChevronUp className="size-4" strokeWidth={2} />
        </button>
        {!closed && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Дії із запитом"
              aria-expanded={menuOpen}
              className="auth-icon-button -mr-1.5"
            >
              <MoreHorizontal className="size-4" strokeWidth={2} />
            </button>
            {menuOpen && (
              <div role="menu" className="request-dock-menu glass-panel">
                <button type="button" role="menuitem" onClick={() => void close()} className="account-menu-item">
                  Закрити запит
                </button>
              </div>
            )}
          </div>
        )}
        </div>
      </header>

      <p className="mt-2 line-clamp-2 text-[15px] leading-snug text-ink">{active.text}</p>
      {requestFacts(active).length > 0 && <p className="mt-1.5 text-[12px] font-medium text-ink-muted">{requestFacts(active).join(" · ")}</p>}
      {(shownTags.length > 0 || active.files.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {shownTags.map((tag) => (
            <span key={tag.id} className="auth-draft-tag">
              {tag.label}
            </span>
          ))}
          {active.tags.length > shownTags.length && (
            <span className="text-[11px] text-ink-muted">ще +{active.tags.length - shownTags.length}</span>
          )}
          {active.files.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
              <Paperclip className="size-3" strokeWidth={2} />
              {active.files.length}
            </span>
          )}
        </div>
      )}

      <div className="request-steps">
        <span aria-hidden className="request-steps-track">
          <span ref={fillRef} className="request-steps-fill" />
        </span>
        <ol className="request-steps-list" aria-label="Кроки виконання">
        {STEPS.map((label, index) => {
          const state = closed ? "idle" : index < current ? "done" : index === current ? "current" : "idle";
          return (
            <li key={label} className="request-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="request-step-dot">{state === "done" && <Check className="size-2.5" strokeWidth={3.4} />}</span>
              <span className="request-step-label">{label}</span>
            </li>
          );
        })}
        </ol>
      </div>

      <p className="request-dock-now" role="status">
        {closed ? (
          "Запит закрито: виконавці його більше не бачать."
        ) : (
          <>
            <span aria-hidden className="request-live-dot" />
            {phase === "done" ? (
              <>Угоду завершено.</>
            ) : phase === "working" ? (
              <>Угода в роботі. Деталі й оплата в чаті з виконавцем.</>
            ) : phase === "negotiating" ? (
              <>Пропозицію угоди надіслано, чекаємо на відповідь виконавця.</>
            ) : offers > 0 ? (
              <>
                {offersCount(offers)} від виконавців.{" "}
                <button type="button" onClick={() => { sidePanelChoice.set("offers"); offersCollapsedStore.set(false); }} className="auth-link">
                  Порівняйте й напишіть
                </button>{" "}
                тому, хто підходить.
              </>
            ) : seen
              ? `Запит бачать ${performersCount(seen)} з потрібними навичками. Відгуки з ціною прийдуть сюди й на пошту.`
              : "Шукаємо виконавців під ваш запит. Відгуки з ціною прийдуть сюди й на пошту."}
          </>
        )}
      </p>
      {error && (
        <p role="alert" className="auth-error mt-1">
          {error}
        </p>
      )}

      <footer className="request-dock-footer">
        <button type="button" onClick={() => composingStore.set(true)} disabled={closing} className="request-dock-new">
          <Plus className="size-4" strokeWidth={2.2} />
          Новий запит
        </button>
        {others.length > 0 && (
          <button type="button" onClick={() => setListOpen((value) => !value)} aria-expanded={listOpen} className="request-dock-all">
            Усі запити · {requests.length}
            <ChevronDown className="size-4 transition-transform" strokeWidth={2} style={{ rotate: listOpen ? "180deg" : "0deg" }} />
          </button>
        )}
      </footer>

      {listOpen && others.length > 0 && (
        <div ref={listRef} className="overflow-hidden">
          <ul className="request-dock-list" aria-label="Інші запити">
            {others.map((request) => (
              <li key={request.id}>
                <button
                  type="button"
                  onClick={() => {
                    activeRequestStore.set(request.id);
                    setListOpen(false);
                  }}
                  className="request-dock-row"
                  data-closed={request.status === "closed" || undefined}
                >
                  <span
                    className="my-request-status shrink-0"
                    role="img"
                    aria-label={request.status === "open" ? "Відкритий" : "Закритий"}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{request.text}</span>
                  <time dateTime={request.createdAt} className="shrink-0 text-[11px] text-ink-muted">
                    {DATE.format(new Date(request.createdAt))}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
