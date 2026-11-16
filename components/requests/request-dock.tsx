"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ArrowRight, Check, ChevronDown, MoreHorizontal, Plus } from "@/components/icons";
import {
  ApiError,
  activeRequestStore,
  closeActiveRequest,
  composingStore,
  justClosedRequestStore,
  recentlyPublishedRequestStore,
  refreshRequestCounts,
  requestCountsStore,
  restoredRequestStore,
  showRequestsListStore,
} from "@/lib/auth/client";
import { useDeals } from "@/lib/deals/client";
import { dealPhase } from "@/lib/deals/machine";
import { setMapMode, showAllPerformers } from "@/lib/feed/map-requests";
import { Button } from "@/components/ui/button";
import { ClampedText } from "@/components/ui/clamped-text";
import { EditRequestScreen } from "@/components/requests/edit-request-screen";
import { ClosePrompt, RenewPrompt } from "@/components/requests/request-prompts";
import { useNow, useRestoreRequest } from "@/components/requests/use-restore-request";
import { offersCollapsedStore, offersCountStore, offersMapStore } from "@/lib/requests/offers";
import { requestFacts } from "@/lib/requests/format";
import { canRestore, restoreLeftLabel } from "@/lib/requests/restore";
import { requestSubline } from "@/lib/requests/subline";
import type { PublishedRequest } from "@/lib/requests/types";
import { RequestFileLinks } from "@/components/requests/parts/request-file-links";
import { useStore } from "@/lib/store";
import { prefersReducedMotion } from "@/lib/ui/media";
import { DURATION_MS, EASE_GSAP } from "@/lib/ui/motion-tokens";

/** Один активний запит над мапою; решта доступні у списку, не займаючи екран. */
export function RequestDock({ requests, active }: { requests: PublishedRequest[]; active: PublishedRequest }) {
  const observedOffers = useStore(offersCountStore);
  const offersMap = useStore(offersMapStore);
  const offers = offersMap.requestId === active.id ? observedOffers : 0;
  const recentlyPublished = useStore(recentlyPublishedRequestStore);
  const showRequestedList = useStore(showRequestsListStore);
  const deals = useDeals(active.id);
  const phase = dealPhase(deals);
  const closed = active.status === "closed";
  const restoredId = useStore(restoredRequestStore);
  const { restoringId, error: restoreError, restore } = useRestoreRequest();
  const now = useNow();
  const [listOpen, setListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestCounts = useStore(requestCountsStore);
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Запит відновили: кнопка «Відновити» зникла, фокус іде на меню відновленого запиту, а не губиться на body (SEM-7).
  useEffect(() => {
    if (restoredId === active.id && !closed) menuButtonRef.current?.focus();
  }, [restoredId, active.id, closed]);

  useEffect(() => {
    if (!showRequestedList) return;
    setListOpen(true);
    setMenuOpen(false);
    setDetailsOpen(false);
    showRequestsListStore.set(false);
  }, [showRequestedList]);

  useLayoutEffect(() => {
    if (!rootRef.current || prefersReducedMotion()) return;
    const tween = gsap.fromTo(rootRef.current, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: DURATION_MS.enter / 1000, ease: EASE_GSAP.reveal });
    return () => {
      tween.kill();
    };
  }, [active.id]);

  useLayoutEffect(() => {
    if (!listOpen || !listRef.current || prefersReducedMotion()) return;
    const tween = gsap.fromTo(listRef.current, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: DURATION_MS.base / 1000, ease: EASE_GSAP.reveal });
    return () => {
      tween.kill();
    };
  }, [listOpen]);

  useEffect(() => {
    if (!listOpen && !menuOpen && !detailsOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setListOpen(false);
      setMenuOpen(false);
      setDetailsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setListOpen(false);
        setMenuOpen(false);
        setDetailsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [listOpen, menuOpen, detailsOpen]);

  // Лічильники відгуків приходять у списку запитів: при відкритті «Моїх запитів» оновлюємо їх одним запитом, а не по запиту на кожен.
  useEffect(() => {
    if (listOpen) void refreshRequestCounts();
  }, [listOpen]);

  const openOffers = () => {
    setMapMode("performers");
    offersCollapsedStore.set(false);
  };

  const selectRequest = (id: string) => {
    activeRequestStore.set(id);
    justClosedRequestStore.set(null);
    setMapMode("performers");
    setListOpen(false);
    setMenuOpen(false);
    setDetailsOpen(false);
  };

  const openEdit = () => {
    setMenuOpen(false);
    setSavedNotice(false);
    setEditing(true);
  };

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

  const onRestore = async (id: string) => {
    if (await restore(id)) setListOpen(false);
  };

  const hasOfferAction = !closed && (offers > 0 || phase !== "none");
  const restoreLabel = closed ? restoreLeftLabel(active.restoreUntil, now) : null;
  const status = closed
    ? `${active.closeReason === "expired" ? "Запит протермінований" : "Запит закрито"}${restoreLabel === null ? "" : ` · ${restoreLabel}`}`
    : recentlyPublished === active.id
      ? "Запит опубліковано · шукаємо виконавців"
      : phase === "done"
        ? "Роботу завершено"
        : phase === "working"
          ? "Робота триває · деталі в чаті"
          : phase === "negotiating"
            ? "Чекаємо на відповідь виконавця"
            : offers > 0
              ? "Є пропозиції: час обрати виконавця"
              : "Очікуємо на перші пропозиції";
  const ordered = [...requests].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const facts = requestFacts(active, new Date());

  return (
    <section ref={rootRef} className="request-summary glass-panel" aria-label="Активний запит" data-closed={closed || undefined}>
      <div className="request-summary-bar">
        <button
          type="button"
          id="my-requests-switch"
          className="request-summary-switch"
          onClick={() => { setListOpen((value) => !value); setMenuOpen(false); setDetailsOpen(false); }}
          aria-expanded={listOpen}
          aria-controls="my-requests-list"
        >
          <span>Мої запити</span>
          <span className="request-summary-count">{requests.length}</span>
          <ChevronDown className="size-4 shrink-0 transition-transform" style={{ rotate: listOpen ? "180deg" : "0deg" }} />
        </button>

        <div className="request-summary-current">
          <button
            type="button"
            className="request-summary-title"
            title="Переглянути запит"
            onClick={() => { setDetailsOpen((value) => !value); setListOpen(false); setMenuOpen(false); }}
            aria-expanded={detailsOpen}
          >
            {active.text}
          </button>
          {hasOfferAction ? (
            <button type="button" className="request-summary-status request-summary-status-action" onClick={openOffers}>
              {status}<ArrowRight className="size-3.5 shrink-0" />
            </button>
          ) : (
            <div className="request-summary-status" role="status">
              {recentlyPublished === active.id && <Check className="size-3.5 shrink-0" />}
              {status}
            </div>
          )}
        </div>

        <div className="request-summary-actions">
          {closed && canRestore(active, now) && (
            <Button variant="offer" onClick={() => void onRestore(active.id)} disabled={restoringId === active.id}>
              Відновити
            </Button>
          )}
          {!closed && (
            <div className="relative">
              <button
                ref={menuButtonRef}
                type="button"
                className="request-summary-icon"
                onClick={() => { setMenuOpen((value) => !value); setListOpen(false); setDetailsOpen(false); }}
                aria-label="Дії із запитом"
                aria-expanded={menuOpen}
                disabled={closing}
              >
                <MoreHorizontal className="size-4" />
              </button>
              {menuOpen && (
                <div className="request-summary-menu glass-panel">
                  <Button variant="bare" className="account-menu-item" onClick={openEdit}>
                    Редагувати запит
                  </Button>
                  <Button variant="bare" className="account-menu-item" onClick={() => void close()}>
                    Закрити запит
                  </Button>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="request-summary-icon request-summary-add"
            onClick={() => { setListOpen(false); setMenuOpen(false); setDetailsOpen(false); composingStore.set(true); }}
            aria-label="Новий запит"
            title="Новий запит"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>

      {(error ?? restoreError) && <p role="alert" className="auth-error request-summary-error">{error ?? restoreError}</p>}
      <p role="status" className="sr-only">{savedNotice ? "Запит збережено" : ""}</p>
      {editing && !closed && <EditRequestScreen request={active} offers={offers} onClose={() => setEditing(false)} onSaved={() => setSavedNotice(true)} />}

      {!closed && <RenewPrompt request={active} closing={closing} onClose={() => void close()} />}
      {!closed && (phase === "working" || phase === "done") && active.renewalDeadline === null && <ClosePrompt key={active.id} closing={closing} onClose={() => void close()} />}

      {/* Поки ніхто не відгукнувся, карта виконавців порожня: пояснюємо це й даємо вихід до всіх. */}
      {!closed && offers === 0 && phase === "none" && (
        <p className="px-3 pb-2 text-xs text-ink-muted">
          Тут з’являться виконавці, які відгукнуться на запит.{" "}
          <Button variant="link" onClick={showAllPerformers} className="inline h-auto p-0 text-xs">
            Показати всіх виконавців
          </Button>
        </p>
      )}

      {detailsOpen && (
        <div className="request-details glass-panel" aria-label="Деталі запиту">
          <div className="request-switcher-heading">Деталі запиту</div>
          <ClampedText text={active.text} className="request-details-text" />
          {facts.length > 0 && <p className="request-details-facts">{facts.join(" · ")}</p>}
          {active.tags.length > 0 && (
            <div className="request-details-tags">
              {active.tags.map((tag) => <span key={tag.id} className="auth-draft-tag max-w-full" title={tag.label}><span className="truncate">{tag.label}</span></span>)}
            </div>
          )}
          <RequestFileLinks files={active.files} label="Прикріплені файли" />
        </div>
      )}

      {listOpen && (
        <div ref={listRef} id="my-requests-list" className="request-switcher glass-panel">
          <div className="request-switcher-heading">Мої запити <span>{requests.length}</span></div>
          <ul className="request-switcher-list" aria-label="Усі мої запити">
            {ordered.map((request) => {
              const count = request.id === active.id ? offers : requestCounts[request.id];
              const subline = requestSubline(request, count, now);
              return (
                <li key={request.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="request-switcher-row min-w-0 flex-1"
                    data-active={request.id === active.id || undefined}
                    data-closed={request.status === "closed" || undefined}
                    aria-current={request.id === active.id ? "true" : undefined}
                    onClick={() => selectRequest(request.id)}
                  >
                    <span className="request-switcher-dot" aria-hidden />
                    <span className="request-switcher-copy">
                      <span className="request-switcher-title">{request.text}</span>
                      <span className="request-switcher-meta">{subline}</span>
                    </span>
                    {count !== undefined && count > 0 && request.status === "open" && <span className="request-switcher-offers">{count}</span>}
                  </button>
                  {canRestore(request, now) && (
                    <Button variant="offer" className="shrink-0" onClick={() => void onRestore(request.id)} disabled={restoringId === request.id}>
                      Відновити
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="request-switcher-new"
            onClick={() => { setListOpen(false); composingStore.set(true); }}
          >
            <Plus className="size-4" /> Новий запит
          </button>
        </div>
      )}
    </section>
  );
}
