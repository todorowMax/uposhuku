"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { gsap } from "gsap";
import { ArrowLeft, ArrowUp, ChevronDown, ChevronsRight, Loader2, MessageCircle, ShieldCheck, Star, X } from "@/components/icons";
import { Maximize2, Minimize2 } from "lucide-react";
import { AVATAR_ATLAS } from "@/lib/map/portrait";
import { useChat } from "@/lib/requests/chat";
import { mentionsContacts } from "@/lib/chat/contacts";
import {
  focusPerformerStore,
  hoveredOfferStore,
  offersCollapsedStore,
  offersViewStore,
  offersWideStore,
  useActiveRequest,
  useOffers,
} from "@/lib/requests/offers";
import type { OfferResponse } from "@/lib/requests/types";
import { DealTab, liveDeal } from "@/components/deals/deal-tab";
import { useDeals } from "@/lib/deals/client";
import { needsAction } from "@/lib/deals/machine";
import { mapModeStore } from "@/lib/feed/map-requests";
import { useSidePanel } from "@/lib/requests/side-panel";
import { useOpenProfile } from "@/lib/profile/navigation";
import { useStore } from "@/lib/store";

const PRICE = new Intl.NumberFormat("uk-UA");
const TIME = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" });

const plural = (count: number, one: string, few: string, many: string) => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return one;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
};

export const offersWord = (count: number) => plural(count, "пропозиція", "пропозиції", "пропозицій");
const daysLabel = (days: number) => `за ${days} ${plural(days, "день", "дні", "днів")}`;
const priceLabel = (price: number | null) => (price === null ? "Ціна після обговорення" : `${PRICE.format(price)} ₴`);
const isPhone = () => window.matchMedia("(max-width: 1023px)").matches;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Пропозиції виконавців праворуч, поки йде підбір: карта ліворуч
 * лишається вільною. Порядок — за оплатою розміщення, у платних позначка
 * «Просування». Нові не стрибають під рукою, а чекають за «+N нових».
 * Чат відкривається в цій самій панелі. На телефоні й вузькому екрані
 * панель — шторка знизу.
 */
export function OffersPanel() {
  const request = useActiveRequest();
  const mapMode = useStore(mapModeStore);
  const { kind } = useSidePanel();
  const requestOpen = request?.status === "open";
  /** Панель видно, лише коли вона вибрана: пропозиції живуть і тоді, коли праворуч стрічка запитів. */
  const open = requestOpen && kind === "offers" && mapMode === "performers";
  const view = useStore(offersViewStore);
  const collapsed = useStore(offersCollapsedStore);
  const wide = useStore(offersWideStore);
  const { loading, offers, declinedOffers, pending, all, revealPending, decline, restore } = useOffers(requestOpen ? request : null);
  const [showDeclined, setShowDeclined] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const known = useRef(new Set<string>());

  // Інший запит — починаємо зі згорнутої панелі, щоб спершу була видна мапа.
  useEffect(() => {
    offersViewStore.set({ kind: "list" });
    offersCollapsedStore.set(true);
    hoveredOfferStore.set(null);
    setShowDeclined(false);
    known.current = new Set();
  }, [request?.id]);

  useEffect(() => {
    if (collapsed || view.kind !== "list" || !open) hoveredOfferStore.set(null);
  }, [collapsed, view.kind, open]);

  // Панель виїжджає збоку (на телефоні — знизу), коли з'являється або розгортається.
  useLayoutEffect(() => {
    if (!panelRef.current || reduced()) return;
    const tween = gsap.fromTo(
      panelRef.current,
      isPhone() ? { y: 24, opacity: 0 } : { x: 24, opacity: 0 },
      { x: 0, y: 0, opacity: 1, duration: 0.34, ease: "power3.out" }
    );
    return () => {
      tween.kill();
    };
  }, [open, collapsed]);

  // Чат заїжджає справа, список повертається зліва.
  useLayoutEffect(() => {
    if (!bodyRef.current || reduced()) return;
    const tween = gsap.fromTo(bodyRef.current, { x: view.kind === "chat" ? 18 : -18, opacity: 0 }, { x: 0, opacity: 1, duration: 0.24, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [view.kind]);

  // Нові картки проявляються по черзі, старі стоять на місці.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || view.kind !== "list") return;
    const fresh = [...body.querySelectorAll<HTMLElement>("[data-offer]")].filter((card) => !known.current.has(card.dataset.offer ?? ""));
    for (const card of fresh) known.current.add(card.dataset.offer ?? "");
    if (!fresh.length || reduced()) return;
    const tween = gsap.fromTo(fresh, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.06, ease: "power2.out" });
    return () => {
      tween.kill();
    };
  }, [offers, view.kind]);

  if (!open || !request) return null;

  const total = all.length;
  const chatWith = view.kind === "chat" ? all.find((item) => item.id === view.responseId) : undefined;

  if (collapsed) {
    return (
      <button type="button" onClick={() => offersCollapsedStore.set(false)} className="offers-tab glass-panel" aria-label={`Розгорнути пропозиції: ${total}`}>
        <MessageCircle className="size-4" />
        Пропозиції
        {offers.length > 0 && <span className="filter-all-badge">{offers.length}</span>}
        {pending.length > 0 && <span className="offers-tab-new">+{pending.length} {plural(pending.length, "нова", "нові", "нових")}</span>}
        <ChevronDown className="size-4 lg:hidden" style={{ rotate: "180deg" }} />
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      aria-label="Пропозиції виконавців"
      className="offers-panel glass-panel"
      data-wide={(chatWith && wide) || undefined}
      onPointerLeave={() => hoveredOfferStore.set(null)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.matches(":hover")) {
          hoveredOfferStore.set(null);
        }
      }}
    >
      {chatWith ? (
        <div ref={bodyRef} className="offers-body">
          <ChatView
            response={chatWith}
            onBack={() => {
              offersWideStore.set(false);
              offersViewStore.set({ kind: "list" });
            }}
          />
        </div>
      ) : (
        <>
          <header className="offers-header">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
                Пропозиції
                {total > 0 && <span className="filter-all-badge">{total}</span>}
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted">Вище ті, хто оплатив розміщення</p>
            </div>
            <button type="button" onClick={() => offersCollapsedStore.set(true)} aria-label="Згорнути пропозиції" className="auth-icon-button -mr-1.5">
              <ChevronsRight className="hidden size-4 lg:block" />
              <ChevronDown className="size-4 lg:hidden" />
            </button>
          </header>

          <div ref={bodyRef} className="offers-body offers-list">
            {pending.length > 0 && (
              <button type="button" onClick={revealPending} className="offers-new">
                <ArrowUp className="size-3.5" />+{pending.length} {plural(pending.length, "нова", "нові", "нових")}
              </button>
            )}

            {loading && (
              <div className="grid justify-items-center py-10">
                <Loader2 className="size-5 animate-spin text-ink-muted" />
              </div>
            )}

            {!loading && offers.length === 0 && pending.length === 0 && (
              <div className="offers-empty">
                <span aria-hidden className="request-live-dot" />
                <p>
                  Чекаємо на перші відгуки. Виконавці з потрібними навичками вже бачать запит, пропозиції з ціною з'являтимуться тут.
                </p>
              </div>
            )}

            {offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onChat={() => offersViewStore.set({ kind: "chat", responseId: offer.id })}
                onDecline={() => decline(offer.id)}
              />
            ))}

            {declinedOffers.length > 0 && (
              <div className="pt-1">
                <button type="button" onClick={() => setShowDeclined((value) => !value)} aria-expanded={showDeclined} className="offers-declined-toggle">
                  Відхилені · {declinedOffers.length}
                  <ChevronDown className="size-3.5 transition-transform" style={{ rotate: showDeclined ? "180deg" : "0deg" }} />
                </button>
                {showDeclined &&
                  declinedOffers.map((offer) => (
                    <div key={offer.id} className="offers-declined-row">
                      <span className="min-w-0 truncate">
                        {offer.name} · {priceLabel(offer.price)}
                      </span>
                      <button type="button" onClick={() => restore(offer.id)} className="auth-link text-[12px]">
                        Повернути
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function Avatar({ index, size, photo }: { index: number; size: number; photo?: string }) {
  const cell = index % 16;
  return (
    <span
      aria-hidden
      className="offer-avatar"
      style={
        photo
          ? { width: size, height: size, backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "center" }
          : {
              width: size,
              height: size,
              backgroundImage: `url(${AVATAR_ATLAS})`,
              backgroundPosition: `${(cell % 4) * 100 / 3}% ${Math.floor(cell / 4) * 100 / 3}%`,
            }
      }
    />
  );
}

function OfferCard({ offer, onChat, onDecline }: { offer: OfferResponse; onChat: () => void; onDecline: () => void }) {
  const openProfile = useOpenProfile();
  const highlightOnMap = () => hoveredOfferStore.set({ requestId: offer.requestId, performerId: offer.performerId });
  useEffect(() => () => {
    const current = hoveredOfferStore.get();
    if (current?.requestId === offer.requestId && current.performerId === offer.performerId) hoveredOfferStore.set(null);
  }, [offer.requestId, offer.performerId]);
  const showOnMap = () => {
    focusPerformerStore.set({ id: offer.performerId, at: Date.now(), toggle: true });
    if (isPhone()) offersCollapsedStore.set(true);
  };
  return (
    <article
      data-offer={offer.id}
      className="offer-card"
      aria-label={`Пропозиція: ${offer.name}`}
      onPointerEnter={highlightOnMap}
      onFocusCapture={highlightOnMap}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        showOnMap();
      }}
    >
      <div className="flex items-start gap-3">
        <button type="button" onClick={showOnMap} aria-label={`Показати ${offer.name} на карті`} className="shrink-0 rounded-full">
          <Avatar index={offer.avatarIndex} size={42} photo={offer.photo} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => openProfile(offer.performerId)} className="truncate text-left text-[14px] font-semibold text-ink underline-offset-4 hover:underline" aria-label={`Профіль: ${offer.name}`}>
              {offer.name}
            </button>
            {offer.rating !== "—" && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] text-ink-muted">
                <Star className="size-3 fill-current" />
                {offer.rating}
              </span>
            )}
            {offer.promoted && <span className="offer-promoted">Просування</span>}
          </div>
          <p className="truncate text-[12px] text-ink-muted">
            {offer.specialty} · {offer.cityName}
          </p>
        </div>
      </div>

      <p className="mt-3 flex items-baseline gap-2">
        <span className={offer.price === null ? "text-[14px] font-semibold text-ink" : "text-[18px] font-semibold tabular-nums text-ink"}>
          {priceLabel(offer.price)}
        </span>
        <span className="text-[12px] text-ink-muted">{daysLabel(offer.days)}</span>
      </p>
      <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-ink/85">{offer.message}</p>

      <div className="mt-3 flex items-center gap-1.5">
        <button type="button" onClick={onChat} className="offer-primary">
          <MessageCircle className="size-4" />
          Написати
        </button>
        <button type="button" onClick={onDecline} aria-label={`Відхилити пропозицію ${offer.name}`} className="offer-secondary ml-auto">
          <X className="size-4" />
          <span className="sr-only sm:not-sr-only">Відхилити</span>
        </button>
      </div>
    </article>
  );
}

/**
 * Переписка з виконавцем у панелі. Зверху — що він запропонував, плашка
 * «домовляйтеся тут»; контакти поза чатом не блокуємо, а попереджаємо.
 */
function ChatView({ response, onBack }: { response: OfferResponse; onBack: () => void }) {
  const { messages, typing, send, error } = useChat(response);
  const wide = useStore(offersWideStore);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const warn = mentionsContacts(draft);
  const deals = useDeals(response.requestId);
  const live = liveDeal(deals, response.id);
  const todo = live ? needsAction(live) : null;
  const [tab, setTab] = useState<"chat" | "deal">("chat");
  // Пропозицію щойно надіслано (або виконавець відповів): показуємо угоду.
  const liveId = live?.id;
  useEffect(() => {
    if (liveId) setTab("deal");
  }, [liveId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [messages.length, typing]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
  }, [draft]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    send(text);
    setDraft("");
  };

  return (
    <div className="chat">
      <header className="chat-header">
        <button type="button" onClick={onBack} aria-label="До пропозицій" className="auth-icon-button -ml-1.5">
          <ArrowLeft className="size-4" />
        </button>
        <Avatar index={response.avatarIndex} size={34} photo={response.photo} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">{response.name}</p>
          <p className="truncate text-[11px] text-ink-muted">{typing ? "друкує…" : response.specialty}</p>
        </div>
        <button
          type="button"
          onClick={() => offersWideStore.set(!wide)}
          aria-label={wide ? "Згорнути чат" : "Розгорнути чат вліво"}
          aria-pressed={wide}
          className="auth-icon-button hidden shrink-0 lg:grid"
        >
          {wide ? <Minimize2 className="size-4" strokeWidth={2} /> : <Maximize2 className="size-4" strokeWidth={2} />}
        </button>
      </header>

      <div className="chat-offer">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tabular-nums text-ink">{priceLabel(response.price)}</p>
          <p className="text-[11px] text-ink-muted">{daysLabel(response.days)}</p>
        </div>
        <button type="button" onClick={() => setTab("deal")} className="offer-secondary">
          {live ? `Угода ${live.number}` : "Запропонувати угоду"}
        </button>
      </div>

      <div className="side-switch chat-tabs" role="tablist" aria-label="Чат і угода">
        <button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
          Чат
        </button>
        <button type="button" role="tab" aria-selected={tab === "deal"} onClick={() => setTab("deal")}>
          Угода
          {todo && <span aria-label="Потрібна ваша дія" className="chat-tab-dot" />}
        </button>
      </div>

      {tab === "deal" ? (
        <div className="chat-deal">
          <DealTab response={response} />
        </div>
      ) : (
        <>

      <div ref={listRef} className="chat-messages" aria-live="polite">
        <p className="chat-notice">
          <ShieldCheck className="size-3.5 shrink-0" />
          Домовляйтеся тут: якщо щось піде не так, ми побачимо переписку й допоможемо.
        </p>
        {messages.map((message) => (
          <div key={message.id} className="chat-bubble" data-from={message.from}>
            <p>{message.text}</p>
            <time dateTime={message.at}>{TIME.format(new Date(message.at))}</time>
          </div>
        ))}
        {error && (
          <p role="status" className="chat-warn">
            Немає зв'язку з сервером. Повідомлення підтягнуться, щойно він повернеться.
          </p>
        )}
        {typing && (
          <div className="chat-bubble chat-typing" data-from="them" aria-label="Виконавець друкує">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      <form onSubmit={submit} className="chat-form">
        {warn && (
          <p role="status" className="chat-warn">
            Домовляйтеся поза чатом на свій ризик: якщо щось піде не так, домовленостей ми не побачимо.
          </p>
        )}
        <div className="chat-input-row">
          <label htmlFor="chat-input" className="sr-only">
            Повідомлення
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Повідомлення"
            className="chat-input"
          />
          <button type="submit" disabled={!draft.trim()} aria-label="Надіслати" className="chat-send">
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
        </>
      )}
    </div>
  );
}
