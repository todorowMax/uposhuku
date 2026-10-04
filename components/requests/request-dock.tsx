"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ArrowRight, Check, ChevronDown, MoreHorizontal, Plus } from "@/components/icons";
import {
  ApiError,
  activeRequestStore,
  closeActiveRequest,
  composingStore,
  recentlyPublishedRequestStore,
  showRequestsListStore,
} from "@/lib/auth/client";
import { useDeals } from "@/lib/deals/client";
import { dealPhase } from "@/lib/deals/machine";
import { setMapMode } from "@/lib/feed/map-requests";
import { offersCollapsedStore, offersCountStore, offersMapStore } from "@/lib/requests/offers";
import { requestFacts } from "@/lib/requests/format";
import type { PublishedRequest } from "@/lib/requests/types";
import { useStore } from "@/lib/store";

const plural = (count: number, one: string, few: string, many: string) => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return one;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
};
const offerLabel = (count: number) => `${count} ${plural(count, "пропозиція", "пропозиції", "пропозицій")}`;

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
  const [listOpen, setListOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherOfferCounts, setOtherOfferCounts] = useState<Record<string, number>>({});
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showRequestedList) return;
    setListOpen(true);
    setMenuOpen(false);
    setDetailsOpen(false);
    showRequestsListStore.set(false);
  }, [showRequestedList]);

  useLayoutEffect(() => {
    if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(rootRef.current, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [active.id]);

  useLayoutEffect(() => {
    if (!listOpen || !listRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(listRef.current, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" });
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

  // Лічильники інших запитів потрібні лише коли людина відкрила їхній список.
  useEffect(() => {
    if (!listOpen) return;
    const controller = new AbortController();
    const others = requests.filter((request) => request.status === "open" && request.id !== active.id);
    void Promise.all(others.map(async (request) => {
      try {
        const response = await fetch(`/api/requests/${encodeURIComponent(request.id)}/responses`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return null;
        const data = (await response.json()) as { responses?: unknown[] };
        return [request.id, data.responses?.length ?? 0] as const;
      } catch {
        return null;
      }
    })).then((counts) => {
      if (!controller.signal.aborted) setOtherOfferCounts(Object.fromEntries(counts.filter((item): item is readonly [string, number] => item !== null)));
    });
    return () => controller.abort();
  }, [listOpen, requests, active.id]);

  const openOffers = () => {
    setMapMode("performers");
    offersCollapsedStore.set(false);
  };

  const selectRequest = (id: string) => {
    activeRequestStore.set(id);
    setMapMode("performers");
    setListOpen(false);
    setMenuOpen(false);
    setDetailsOpen(false);
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

  const hasOfferAction = !closed && (offers > 0 || phase !== "none");
  const status = closed
    ? "Запит закрито"
    : recentlyPublished === active.id
      ? "Запит опубліковано · шукаємо виконавців"
      : phase === "done"
        ? "Роботу завершено"
        : phase === "working"
          ? "Робота триває · деталі в чаті"
          : phase === "negotiating"
            ? "Чекаємо на відповідь виконавця"
            : offers > 0
              ? "Є пропозиції — час обрати виконавця"
              : "Очікуємо на перші пропозиції";
  const ordered = [...requests].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const facts = requestFacts(active);

  return (
    <section ref={rootRef} className="request-summary glass-panel" aria-label="Активний запит" data-closed={closed || undefined}>
      <div className="request-summary-bar">
        <button
          type="button"
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
          {!closed && (
            <div className="relative">
              <button
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
                <div role="menu" className="request-summary-menu glass-panel">
                  <button type="button" role="menuitem" className="account-menu-item" onClick={() => void close()}>
                    Закрити запит
                  </button>
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

      {error && <p role="alert" className="auth-error request-summary-error">{error}</p>}

      {detailsOpen && (
        <div className="request-details glass-panel" aria-label="Деталі запиту">
          <div className="request-switcher-heading">Деталі запиту</div>
          <p className="request-details-text">{active.text}</p>
          {facts.length > 0 && <p className="request-details-facts">{facts.join(" · ")}</p>}
          {active.tags.length > 0 && (
            <div className="request-details-tags">
              {active.tags.map((tag) => <span key={tag.id} className="auth-draft-tag">{tag.label}</span>)}
            </div>
          )}
          {active.files.length > 0 && <p className="request-details-facts">Прикріплено файлів: {active.files.length}</p>}
        </div>
      )}

      {listOpen && (
        <div ref={listRef} id="my-requests-list" className="request-switcher glass-panel">
          <div className="request-switcher-heading">Мої запити <span>{requests.length}</span></div>
          <ul className="request-switcher-list" aria-label="Усі мої запити">
            {ordered.map((request) => {
              const count = request.id === active.id ? offers : otherOfferCounts[request.id];
              const subline = request.status === "closed"
                ? "Закритий"
                : count === undefined
                  ? "Шукаємо виконавців"
                  : count === 0
                    ? "Очікує відгуків"
                    : offerLabel(count);
              return (
                <li key={request.id}>
                  <button
                    type="button"
                    className="request-switcher-row"
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
