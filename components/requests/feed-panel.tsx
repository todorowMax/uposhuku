"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { gsap } from "gsap";
import { CalendarClock, Check, ChevronDown, ChevronsRight, Inbox, Loader2, MapPin, Send, Wallet } from "@/components/icons";
import { ApiError } from "@/lib/auth/client";
import { applyRequestFilter, hoveredFeedRequestStore, mapRequestsStore, requestFilterStore } from "@/lib/feed/map-requests";
import { Button } from "@/components/ui/button";
import { OwnRequestRow } from "@/components/requests/own-request-row";
import { filterTags } from "@/lib/map/filters";
import { sendResponse, useFeed, withdrawResponse } from "@/lib/feed/client";
import { RESPONSE_LIMITS, type FeedItem, type MyResponse } from "@/lib/feed/types";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { feedCollapsedStore, useSidePanel } from "@/lib/requests/side-panel";
import { placementOpenStore, placementStore } from "@/lib/placement/client";
import { TIER_NAMES } from "@/lib/placement/tiers";
import type { PlacementTier } from "@/lib/map/types";
import { useAutoGrow } from "@/lib/ui/auto-grow";
import { usePanelSwipe } from "@/lib/ui/use-panel-swipe";
import { isPhoneViewport, prefersReducedMotion } from "@/lib/ui/media";
import { daysLabel, deadlineText, plural, priceLabel } from "@/lib/requests/format";
import { RequestFileLinks } from "@/components/requests/parts/request-file-links";
import { useStore } from "@/lib/store";
import { EVENTS, track } from "@/lib/telemetry/track";

const collapseFeed = () => feedCollapsedStore.set(true);

const EDITED_AT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });


/** «щойно», «12 хв тому», «3 год тому», «вчора». */
const ago = (iso: string, now = Date.now()) => {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "щойно";
  if (minutes < 60) return `${minutes} хв тому`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} год тому`;
  return hours < 48 ? "вчора" : `${Math.round(hours / 24)} дн. тому`;
};

/**
 * Запити під теги профілю праворуч, поки людина шукає роботу: те, що
 * замовники публікують зараз, найвідповідніші першими. Нові не стрибають під
 * рукою: чекають за «+N нових». «Відгукнутися» розкриває форму прямо в картці.
 */
export function FeedPanel() {
  const { kind } = useSidePanel();
  const active = kind === "feed";
  const collapsed = useStore(feedCollapsedStore);
  const { loading, error, items: allItems, pending, total, hasMore, loadingMore, loadMore, reveal, patch } = useFeed(active);
  const mapState = useStore(mapRequestsStore);
  const filter = useStore(requestFilterStore);
  const pickedTags = useStore(filterTags);
  // Список слухається тих самих чипів, що й карта, і фільтрує завантажені сторінки.
  const filtered = filter !== "all" || pickedTags.length > 0;
  const items = filtered ? applyRequestFilter(allItems, filter, pickedTags) : allItems;
  const ownOpen = mapState.items.filter((item) => item.own);
  const panelRef = useRef<HTMLElement | null>(null);
  const [panelNode, setPanelNode] = useState<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const known = useRef(new Set<string>());
  const setPanel = useCallback((node: HTMLElement | null) => {
    panelRef.current = node;
    setPanelNode(node);
  }, []);
  usePanelSwipe(panelNode, collapseFeed);

  useLayoutEffect(() => {
    if (!active || collapsed) hoveredFeedRequestStore.set(null);
  }, [active, collapsed]);

  // Шлюз знімає панель, коли режим карти інший: підсвітку картки не лишаємо.
  useEffect(() => () => hoveredFeedRequestStore.set(null), []);

  useLayoutEffect(() => {
    if (!active || !panelRef.current || prefersReducedMotion()) return;
    const tween = gsap.fromTo(
      panelRef.current,
      isPhoneViewport() ? { y: 24, opacity: 0 } : { x: 24, opacity: 0 },
      // clearProps: після появи transform знову віддаємо CSS, інакше inline-стиль GSAP глушить зсув свайпом (`--sheet-drag`).
      { x: 0, y: 0, opacity: 1, duration: 0.34, ease: "power3.out", clearProps: "transform" }
    );
    return () => {
      tween.kill();
    };
  }, [active, collapsed]);

  // Нові картки проявляються по черзі, старі стоять на місці.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const fresh = [...body.querySelectorAll<HTMLElement>("[data-feed]")].filter((card) => !known.current.has(card.dataset.feed ?? ""));
    for (const card of fresh) known.current.add(card.dataset.feed ?? "");
    if (!fresh.length || prefersReducedMotion()) return;
    const tween = gsap.fromTo(fresh, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.06, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [items]);

  // Виконавець відкрив стрічку: скільки запитів і скільки з них під його теги.
  const feedShown = active && !collapsed && !loading;
  useEffect(() => {
    if (feedShown) track(EVENTS.feedOpened, { count: allItems.length, matched: allItems.filter((item) => item.matchedTags > 0).length });
    // Рахуємо відкриття стрічки, а не кожен новий запит у ній.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedShown]);

  if (!active) return null;

  if (collapsed) {
    return (
      <Button variant="bare" onClick={() => feedCollapsedStore.set(false)} className="offers-tab feed-tab glass-panel" aria-label={`Розгорнути запити: ${total}`}>
        <Inbox className="size-4" />
        Запити для вас
        {total > 0 && <span className="filter-all-badge">{total}</span>}
        {pending.length > 0 && <span className="offers-tab-new">+{pending.length} {plural(pending.length, "новий", "нові", "нових")}</span>}
        <ChevronDown className="size-4 lg:hidden" style={{ rotate: "180deg" }} />
      </Button>
    );
  }

  return (
    <aside
      ref={setPanel}
      aria-label="Запити для виконавця"
      className="offers-panel feed-panel glass-panel"
      onPointerLeave={() => hoveredFeedRequestStore.set(null)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.matches(":hover")) hoveredFeedRequestStore.set(null);
      }}
    >
      <span className="offers-grip" aria-hidden />
      <header className="offers-header">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            Запити для вас
            {total > 0 && <span className="filter-all-badge">{total}</span>}
          </h2>
          <p className="offers-header-note">Усі відкриті, найвідповідніші під ваші теги першими</p>
        </div>
        <Button variant="icon" onClick={collapseFeed} aria-label="Згорнути запити" className="-mr-1.5">
          <ChevronsRight className="hidden size-4 lg:block" />
          <ChevronDown className="size-4 lg:hidden" />
        </Button>
      </header>

      <div ref={bodyRef} tabIndex={-1} className="offers-body offers-list outline-none">
        {pending.length > 0 && (
          <Button
            variant="bare"
            onClick={() => {
              reveal();
              // Кнопка зникає: фокус переходимо на список, щоб він не впав на body, і гортаємо до нових.
              bodyRef.current?.focus({ preventScroll: true });
              bodyRef.current?.scrollTo({ top: 0 });
            }}
            className="offers-new offers-new-fresh"
          >
            +{pending.length} {plural(pending.length, "новий запит", "нові запити", "нових запитів")}. Показати
          </Button>
        )}
        {ownOpen.map((item) => (
          <OwnRequestRow key={item.id} item={item} />
        ))}
        {loading && (
          <div className="grid justify-items-center py-10">
            <Loader2 className="size-5 animate-spin text-ink-muted" />
          </div>
        )}
        {error && (
          <p role="alert" className="auth-error px-1">
            {error}
          </p>
        )}
        {filtered && (
          <Button variant="bare" onClick={() => requestFilterStore.set("all")} className="offers-new">
            Фільтр: показано {items.length} з {allItems.length}. Скинути
          </Button>
        )}
        {!loading && !error && items.length === 0 && pending.length === 0 && !filtered && (
          <div className="offers-empty">
            <span aria-hidden className="request-live-dot" />
            <p>
              Поки немає відкритих запитів.{" "}
              <Button variant="link" onClick={() => profileEditorStore.set(true)}>
                Додайте теги й роботи в профілі
              </Button>
              , і ми повідомимо, коли з&apos;явиться запит під ваші теги.
            </p>
          </div>
        )}
        {items.map((item) => (
          <FeedCard key={item.id} item={item} onChange={(change) => patch(item.id, change)} onHover={() => hoveredFeedRequestStore.set(item.id)} />
        ))}
        {hasMore && (
          <div className="grid justify-items-center gap-1 py-2">
            <Button variant="bare" disabled={loadingMore} onClick={() => void loadMore()} className="offers-new">
              {loadingMore && <Loader2 className="size-4 animate-spin" />}
              Показати ще
            </Button>
            <p role="status" className="pe-hint">
              Показано {allItems.length} з {total}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Що показати замість «Відгукнутися», коли відгукнутися ще не можна. */
export interface RespondGate {
  label: string;
  note: string;
  onClick: () => void;
}

/**
 * Картка запиту: у правій колонці виконавця й на карті біля маркера. Якщо
 * людина ще не виконавець (або це її власний запит), замість форми — gate.
 */
export function FeedCard({
  item,
  onChange,
  gate,
  bare = false,
  onHover,
}: {
  item: FeedItem;
  onChange: (change: (item: FeedItem) => FeedItem) => void;
  gate?: RespondGate;
  /** Без власної рамки: усередині картки на карті. */
  bare?: boolean;
  onHover?: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const deadline = deadlineText(item.deadline, item.deadlineDate, new Date());

  useLayoutEffect(() => {
    if (!formOpen || !formRef.current || prefersReducedMotion()) return;
    const tween = gsap.fromTo(formRef.current, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.26, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [formOpen]);

  const submit = async (value: Pick<MyResponse, "price" | "days" | "message">) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await sendResponse(item.id, value);
      onChange((current) => ({ ...current, response: saved, responses: current.response ? current.responses : current.responses + 1 }));
      setFormOpen(false);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося надіслати відгук.");
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await withdrawResponse(item.id);
      onChange((current) => ({ ...current, response: null, responses: Math.max(0, current.responses - 1) }));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося відкликати відгук.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article data-feed={item.id} className={bare ? "feed-bare" : "offer-card"} aria-label="Запит замовника" onPointerEnter={onHover} onFocusCapture={onHover}>
      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3" />
          {item.place}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {item.editedAt && (
            <time dateTime={item.editedAt} title={`Змінено ${EDITED_AT.format(new Date(item.editedAt))}`} className="rounded-full border border-line px-1.5 py-px font-medium text-ink-muted">
              Змінено
            </time>
          )}
          <time dateTime={item.createdAt}>{ago(item.createdAt)}</time>
        </span>
      </div>

      <p className={`mt-2 text-[14px] leading-snug text-ink ${more ? "" : "line-clamp-4"}`}>{item.text}</p>
      {item.text.length > 150 && (
        <button type="button" onClick={() => setMore((value) => !value)} aria-expanded={more} className="mt-1 text-[12px] font-medium text-ink-muted underline decoration-[#b8c4c7] underline-offset-4 hover:text-ink">
          {more ? "Згорнути" : "Розгорнути"}
        </button>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {item.tags.map((tag) => (
          <span key={tag.id} className="auth-draft-tag" data-matched={tag.matched || undefined}>
            {tag.matched && <Check className="mr-1 size-3 text-brand" aria-label="Є у вашому профілі" />}
            {tag.label}
          </span>
        ))}
      </div>

      <RequestFileLinks files={item.files ?? []} />

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
        {item.budget && (
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <Wallet className="size-3.5" />
            {item.budget}
          </span>
        )}
        {deadline && (
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <CalendarClock className="size-3.5" />
            {deadline}
          </span>
        )}
        <span>
          Збіг: {item.matchedTags} з {item.tags.length} {plural(item.tags.length, "тегу", "тегів", "тегів")}
        </span>
        <span>{item.responses > 0 ? `Відгукнулись: ${item.responses}` : "Ще без відгуків"}</span>
      </div>

      {gate ? (
        <div className="mt-3">
          <button type="button" onClick={gate.onClick} className="offer-primary w-full">
            {gate.label}
          </button>
          <p className="pe-hint mt-1.5 text-center">{gate.note}</p>
        </div>
      ) : item.response ? (
        <div className="feed-sent">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#4d7a5e]">
            <Check className="size-3.5" />
            Ви відгукнулись
          </div>
          <p className="mt-1 text-[13px] text-ink">
            <span className="font-semibold tabular-nums">{priceLabel(item.response.price)}</span> · {daysLabel(item.response.days)}
          </p>
          <div className="mt-2 flex gap-1">
            <button type="button" disabled={busy} onClick={() => setFormOpen((value) => !value)} className="offer-secondary">
              Змінити
            </button>
            <button type="button" disabled={busy} onClick={() => void withdraw()} className="offer-secondary">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Відкликати
            </button>
          </div>
        </div>
      ) : (
        !formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} className="offer-primary mt-3 w-full">
            <Send className="size-4" />
            Відгукнутися
          </button>
        )
      )}

      {formOpen && (
        <div ref={formRef} className="overflow-hidden">
          <ResponseForm
            initial={item.response}
            busy={busy}
            error={error}
            onCancel={() => {
              setFormOpen(false);
              setError(null);
            }}
            onSubmit={submit}
          />
        </div>
      )}
      {!formOpen && error && (
        <p role="alert" className="auth-error mt-2">
          {error}
        </p>
      )}
    </article>
  );
}

/** Ціна, термін і кілька слів замовнику. Ціна — число або «після обговорення». */
function ResponseForm({
  initial,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  initial: MyResponse | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: Pick<MyResponse, "price" | "days" | "message">) => void;
}) {
  const profile = useStore(profileStore);
  const specialty = profile.status === "ready" ? profile.profile?.specialty.trim() : "";
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [open, setOpen] = useState(initial ? initial.price === null : false);
  const [days, setDays] = useState(initial ? String(initial.days) : "");
  const [message, setMessage] = useState(
    initial?.message ?? `Добрий день! Бачу ваш запит.${specialty ? ` Моя спеціалізація: ${specialty}.` : ""} Можу взятися: спершу уточню деталі, потім запропоную план і терміни.`
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const id = useId();
  const messageRef = useAutoGrow(message, 10);
  const tier = useStore(placementStore)?.tier ?? 1;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = open ? null : Number(price.replace(/\s/g, ""));
    if (!open && !(amount && amount > 0)) return setLocalError("Вкажіть ціну в гривнях або оберіть «після обговорення».");
    const term = Number(days);
    if (!(term >= RESPONSE_LIMITS.minDays && term <= RESPONSE_LIMITS.maxDays)) return setLocalError("Вкажіть, за скільки днів зробите.");
    if (message.trim().length < 10) return setLocalError("Напишіть кілька слів замовнику.");
    setLocalError(null);
    onSubmit({ price: amount, days: Math.round(term), message: message.trim() });
  };

  const shown = localError ?? error;
  return (
    <form onSubmit={submit} className="feed-form" noValidate>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-price`} className="pe-label">
            Ціна, ₴
          </label>
          <input
            id={`${id}-price`}
            inputMode="numeric"
            value={open ? "" : price}
            disabled={open}
            onChange={(event) => setPrice(event.target.value.replace(/[^\d\s]/g, ""))}
            placeholder="12 500"
            className="auth-input w-full tabular-nums"
          />
        </div>
        <div>
          <label htmlFor={`${id}-days`} className="pe-label">
            Термін, днів
          </label>
          <input
            id={`${id}-days`}
            inputMode="numeric"
            value={days}
            onChange={(event) => setDays(event.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="14"
            className="auth-input w-full tabular-nums"
          />
        </div>
      </div>
      <label className="feed-check">
        <input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} />
        Ціна після обговорення
      </label>

      <label htmlFor={`${id}-message`} className="pe-label mt-2">
        Повідомлення замовнику
      </label>
      <textarea
        id={`${id}-message`}
        ref={messageRef}
        value={message}
        maxLength={RESPONSE_LIMITS.message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
        className="auth-input w-full resize-y py-2.5 leading-snug"
      />
      <p className="pe-hint">
        {tier <= 1 ? (
          <>
            Вище в списку замовника стоять ті, хто оплатив розміщення. Ваш рівень базовий.{" "}
            <button type="button" onClick={() => placementOpenStore.set(true)} className="auth-link text-[12px]">
              Підняти
            </button>
          </>
        ) : (
          <>Ваш рівень «{TIER_NAMES[tier as PlacementTier]}»: ваш відгук вище, ніж у тих, хто платив менше, і з позначкою «Просування».</>
        )}
      </p>

      {shown && (
        <p role="alert" className="auth-error">
          {shown}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="offer-primary flex-1">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {initial ? "Зберегти відгук" : "Надіслати відгук"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="offer-secondary">
          Скасувати
        </button>
      </div>
    </form>
  );
}
