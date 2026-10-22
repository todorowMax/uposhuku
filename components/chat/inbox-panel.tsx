"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import {
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  FileText,
  ImagePlus,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  X,
} from "lucide-react";
import {
  fetchConversations,
  fetchOrders,
  openConversation,
  uploadChatPhoto,
  useRemoteChat,
} from "@/lib/chat/client";
import { compressForChat } from "@/lib/images/resize";
import { startPolling } from "@/lib/realtime/client";
import {
  CHAT_PHOTOS_MAX,
  CHAT_TEXT_MAX,
  type ConversationDto,
  type ConversationOrderDto,
} from "@/lib/chat/types";
import { ApiError, sessionStore } from "@/lib/auth/client";
import {
  currentStage,
  dealTotal,
  payoutOf,
  performerNeeds,
} from "@/lib/deals/machine";
import type { Deal, PerformerAction } from "@/lib/deals/types";
import { mentionsContacts } from "@/lib/chat/contacts";
import { DealTab } from "@/components/deals/deal-tab";
import { DirectDeals, TermsForm } from "@/components/chat/direct-deals";
import { offersMapStore } from "@/lib/requests/offers";
import type { OfferResponse } from "@/lib/requests/types";
import { createStore, useStore } from "@/lib/store";
import { useKeyboardInset } from "@/lib/ui/use-keyboard-inset";
import { EVENTS, track } from "@/lib/telemetry/track";

const TIME = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
});
const POLL_MS = 8000;

/** Просять відкрити «Повідомлення» (з посилання в Telegram): одразу розмову чи лише список. */
export const inboxOpenStore = createStore<{
  conversationId: string | null;
  /** Відкрити розмову з цим виконавцем (створюємо, якщо її ще не було). */
  performerId?: string;
} | null>(null);

type Size = "compact" | "wide";
type Filter = "all" | ConversationDto["phase"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Усі" },
  { id: "chat", label: "Чати" },
  { id: "deal", label: "Угоди" },
  { id: "done", label: "Завершені" },
];

/**
 * Вхідні повідомлення: розмови, де людина замовник або виконавець. Виконавцю це
 * єдине місце, де видно, що йому написали з профілю. Кнопка з'являється, коли є
 * хоч одна розмова; список оновлюється раз на кілька секунд.
 */
export function InboxPanel() {
  const session = useStore(sessionStore);
  const [items, setItems] = useState<ConversationDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ConversationDto | null>(null);
  const [size, setSize] = useState<Size>("compact");
  const [filter, setFilter] = useState<Filter>("all");
  const signedIn = session.status === "user";
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  useKeyboardInset(panelRef, open);

  // Панель розкривається з кнопки: розмір, форма й м'яке світіння.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!open || !panel) return;
    closing.current = false;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || !button) return;
    const to = panel.getBoundingClientRect();
    const from = button.getBoundingClientRect();
    const timeline = gsap.timeline({
      onComplete: () =>
        gsap.set(panel, {
          clearProps: "left,top,width,height,right,bottom,borderRadius",
        }),
    });
    timeline.fromTo(
      panel,
      {
        right: "auto",
        bottom: "auto",
        left: from.left,
        top: from.top,
        width: from.width,
        height: from.height,
        borderRadius: 20,
      },
      {
        left: to.left,
        top: to.top,
        width: to.width,
        height: to.height,
        borderRadius: 24,
        duration: 0.46,
        ease: "expo.out",
      },
      0,
    );
    timeline.fromTo(
      innerRef.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.26, ease: "power2.out" },
      0.18,
    );
    return () => {
      timeline.kill();
    };
  }, [open]);

  // Компактне ↔ розгорнуте: вікно росте з поточного розміру, колонки проявляються.
  const sizeFrom = useRef<DOMRect | null>(null);
  const toggleSize = () => {
    sizeFrom.current = panelRef.current?.getBoundingClientRect() ?? null;
    setSize((current) => (current === "wide" ? "compact" : "wide"));
  };
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const from = sizeFrom.current;
    sizeFrom.current = null;
    if (
      !panel ||
      !from ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const to = panel.getBoundingClientRect();
    const timeline = gsap.timeline({
      onComplete: () =>
        gsap.set(panel, { clearProps: "left,top,width,height,right,bottom" }),
    });
    timeline.fromTo(
      panel,
      {
        right: "auto",
        bottom: "auto",
        left: from.left,
        top: from.top,
        width: from.width,
        height: from.height,
      },
      {
        left: to.left,
        top: to.top,
        width: to.width,
        height: to.height,
        duration: 0.44,
        ease: "expo.out",
      },
      0,
    );
    timeline.fromTo(
      panel.querySelectorAll(".inbox-side, .inbox-main"),
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.07, ease: "power2.out" },
      0.14,
    );
    return () => {
      timeline.kill();
    };
  }, [size]);

  const close = () => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (closing.current) return;
    if (
      !panel ||
      !button ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return setOpen(false);
    closing.current = true;
    const from = panel.getBoundingClientRect();
    const to = button.getBoundingClientRect();
    gsap
      .timeline({ onComplete: () => setOpen(false) })
      .set(panel, {
        right: "auto",
        bottom: "auto",
        left: from.left,
        top: from.top,
        width: from.width,
        height: from.height,
      })
      .to(
        innerRef.current,
        { opacity: 0, duration: 0.12, ease: "power1.in" },
        0,
      )
      .to(
        panel,
        {
          left: to.left,
          top: to.top,
          width: to.width,
          height: to.height,
          borderRadius: 20,
          duration: 0.34,
          ease: "expo.inOut",
        },
        0.04,
      );
  };

  useEffect(() => {
    if (!signedIn) {
      setItems([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const load = () => {
      if (document.hidden) return;
      void fetchConversations()
        .then((list) => !cancelled && setItems(list))
        .catch(() => {});
    };
    load();
    const stop = startPolling(load, POLL_MS, ["message"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [signedIn, open]);

  // Посилання з Telegram: відкриваємо список чи конкретну розмову, щойно вони завантажились.
  const requested = useStore(inboxOpenStore);
  useEffect(() => {
    if (!requested?.performerId || !signedIn) return;
    const performerId = requested.performerId;
    inboxOpenStore.set(null);
    setOpen(true);
    void openConversation(performerId)
      .then(async (id) => {
        const list = await fetchConversations();
        setItems(list);
        const target = list.find((item) => item.id === id);
        if (target) setActive(target);
      })
      .catch(() => {});
  }, [requested, signedIn]);

  useEffect(() => {
    if (!requested || requested.performerId || !signedIn || items.length === 0)
      return;
    setOpen(true);
    const target = requested.conversationId
      ? items.find((item) => item.id === requested.conversationId)
      : null;
    if (target) setActive(target);
    inboxOpenStore.set(null);
  }, [requested, signedIn, items]);

  if (!signedIn || (items.length === 0 && !open)) return null;
  // Бейдж: розмови, де щось чекає на мене (угода), а якщо таких немає, то де я виконавець.
  const actionCount =
    items.filter((item) => item.deal?.needsMe).length ||
    items.filter((item) => item.role === "performer").length;

  return (
    <>
      {
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          className="inbox-button"
          style={open ? { visibility: "hidden" } : undefined}
          aria-label={`Повідомлення: ${items.length}`}
        >
          <MessageCircle className="size-4" strokeWidth={1.9} />
          <span className="inbox-label">Повідомлення</span>
          {actionCount > 0 && (
            <span className="inbox-badge">{actionCount}</span>
          )}
        </button>
      }
      {open && (
        <section
          ref={panelRef}
          role="dialog"
          aria-label="Повідомлення"
          className="inbox-panel"
          data-view={active ? "thread" : "list"}
          data-size={size}
        >
          <div ref={innerRef} className="inbox-inner inbox-split">
            <aside className="inbox-side">
              <header className="inbox-header">
                <h2>Повідомлення</h2>
                <button
                  type="button"
                  onClick={toggleSize}
                  aria-label={
                    size === "wide" ? "Згорнути вікно" : "Розгорнути вікно"
                  }
                  aria-pressed={size === "wide"}
                  className="dr-close inbox-expand"
                >
                  {size === "wide" ? (
                    <Minimize2 className="size-4" strokeWidth={2} />
                  ) : (
                    <Maximize2 className="size-4" strokeWidth={2} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Закрити"
                  className="dr-close inbox-close-list"
                >
                  <X className="size-4" strokeWidth={2.2} />
                </button>
              </header>
              <div
                className="inbox-filters"
                role="tablist"
                aria-label="Розмови"
              >
                {FILTERS.filter(
                  (entry) =>
                    entry.id === "all" ||
                    items.some((item) => item.phase === entry.id),
                ).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === entry.id}
                    onClick={() => setFilter(entry.id)}
                    className="inbox-filter"
                  >
                    {entry.label}
                    <span>
                      {entry.id === "all"
                        ? items.length
                        : items.filter((item) => item.phase === entry.id)
                            .length}
                    </span>
                  </button>
                ))}
              </div>
              <ul className="inbox-list">
                {items
                  .filter((item) => filter === "all" || item.phase === filter)
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          track(EVENTS.chatOpened, { from: "inbox" });
                          setActive(item);
                        }}
                        className="inbox-row"
                        data-active={active?.id === item.id || undefined}
                      >
                        <span className="inbox-name">
                          {item.other.name}
                          <em>
                            {item.role === "performer"
                              ? "замовник"
                              : (item.other.specialty ?? "виконавець")}
                          </em>
                        </span>
                        {item.offer && !item.deal && (
                          <span className="inbox-offer-tag">
                            Відгук на «{item.offer.title}»
                          </span>
                        )}
                        {item.deal && (
                          <span
                            className="inbox-deal-tag"
                            data-action={item.deal.needsMe || undefined}
                          >
                            <FileText
                              aria-hidden
                              className="size-3"
                              strokeWidth={2}
                            />
                            {item.deal.label}
                          </span>
                        )}
                        <span className="inbox-preview">
                          {item.lastMessage
                            ? item.lastMessage.text || "📷 Фото"
                            : "Без повідомлень"}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </aside>
            <div className="inbox-main">
              {active ? (
                <Thread
                  key={active.id}
                  conversation={active}
                  onBack={() => setActive(null)}
                  onClose={close}
                  size={size}
                  onToggleSize={toggleSize}
                />
              ) : (
                <p className="inbox-empty">Оберіть розмову зі списку</p>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Thread({
  conversation,
  onBack,
  onClose,
  size,
  onToggleSize,
}: {
  conversation: ConversationDto;
  onBack: () => void;
  onClose: () => void;
  size: Size;
  onToggleSize: () => void;
}) {
  // Відгук цього виконавця на відкритий запит замовника: від нього рахується угода.
  const offers = useStore(offersMapStore);
  const response =
    conversation.role === "customer"
      ? offers.responses.find(
          (item) => item.performerId === conversation.performerId,
        )
      : undefined;
  const chat = useRemoteChat(conversation.performerId, true, undefined, {
    id: conversation.id,
    role: conversation.role,
  });
  const [draft, setDraft] = useState("");
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    // Аккордеон замовлень стискує стрічку до смужки: показуємо в ній останні повідомлення.
  }, [chat.lines.length, ordersOpen]);

  const ready = photos.filter((photo) => photo.id);
  const uploading = photos.some((photo) => !photo.id);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setPhotoError(null);
    const room = CHAT_PHOTOS_MAX - photos.length;
    for (const file of [...files].slice(0, Math.max(0, room))) {
      const tempId = `tmp_${crypto.randomUUID()}`;
      try {
        const blob = await compressForChat(file);
        setPhotos((current) => [
          ...current,
          { tempId, preview: URL.createObjectURL(blob) },
        ]);
        const uploaded = await uploadChatPhoto(conversation.id, blob);
        setPhotos((current) =>
          current.map((photo) =>
            photo.tempId === tempId ? { ...photo, id: uploaded.id } : photo,
          ),
        );
      } catch (reason) {
        setPhotos((current) =>
          current.filter((photo) => photo.tempId !== tempId),
        );
        setPhotoError(
          reason instanceof Error && reason.message
            ? reason.message
            : "Не вдалося додати фото.",
        );
      }
    }
    if (files.length > room)
      setPhotoError(`До ${CHAT_PHOTOS_MAX} фото в одному повідомленні.`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = (tempId: string) => {
    setPhotos((current) => {
      const gone = current.find((photo) => photo.tempId === tempId);
      if (gone) URL.revokeObjectURL(gone.preview);
      return current.filter((photo) => photo.tempId !== tempId);
    });
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && ready.length === 0) || uploading) return;
    void chat.send(
      text,
      ready.map((photo) => photo.id as string),
    );
    setDraft("");
    photos.forEach((photo) => URL.revokeObjectURL(photo.preview));
    setPhotos([]);
  };

  return (
    <>
      <header className="inbox-header">
        <button
          type="button"
          onClick={onBack}
          aria-label="До списку"
          className="dr-close inbox-back"
        >
          <ArrowLeft className="size-4" strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate">{conversation.other.name}</h2>
          {chat.typing && (
            <p className="text-[11px] leading-tight text-ink-muted">друкує…</p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleSize}
          aria-label={size === "wide" ? "Згорнути вікно" : "Розгорнути вікно"}
          aria-pressed={size === "wide"}
          className="dr-close"
        >
          {size === "wide" ? (
            <Minimize2 className="size-4" strokeWidth={2} />
          ) : (
            <Maximize2 className="size-4" strokeWidth={2} />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрити"
          className="dr-close"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </header>
      <OrdersBar
        conversation={conversation}
        response={response}
        open={ordersOpen}
        onOpenChange={setOrdersOpen}
      />
      <div
        ref={listRef}
        className="dm-scroll inbox-thread"
        aria-live="polite"
        onPointerDown={() => setOrdersOpen(false)}
      >
        {!chat.loaded && chat.lines.length === 0 && (
          <div
            className="inbox-loading"
            role="status"
            aria-label="Завантажуємо переписку"
          >
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {chat.loaded &&
          chat.lines.length === 0 &&
          !conversation.lastMessage &&
          !chat.error && (
            <p className="inbox-hint">
              Опишіть задачу: що потрібно зробити, строки й бюджет. Домовитесь
              тут, а коли всі умови зійдуться, оформите угоду.
            </p>
          )}
        {chat.lines.map((line) =>
          line.kind === "system" ? (
            <p key={line.id} className="dm-system">
              {line.text}
              <time dateTime={line.at}>{TIME.format(new Date(line.at))}</time>
            </p>
          ) : (
            <div key={line.id} className="dm-bubble" data-from={line.from}>
              {line.photos && (
                <div className="dm-photos" data-count={line.photos.length}>
                  {line.photos.map((url) => (
                    <button
                      key={url}
                      type="button"
                      className="dm-photo"
                      aria-label="Відкрити фото"
                      onClick={() => setViewer(url)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Фото з чату" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              {line.text && <p>{line.text}</p>}
              <time dateTime={line.at}>{TIME.format(new Date(line.at))}</time>
            </div>
          ),
        )}
        {chat.error && (
          <p className="dm-warn">
            Немає зв'язку з сервером. Повідомлення підтягнуться, щойно він
            повернеться.
          </p>
        )}
      </div>
      {mentionsContacts(draft) && (
        <p className="dm-warn">
          Домовляйтеся тут: поза чатом ми не побачимо домовленостей.
        </p>
      )}
      {photoError && <p className="dm-warn">{photoError}</p>}
      {photos.length > 0 && (
        <ul className="dm-staged">
          {photos.map((photo) => (
            <li key={photo.tempId} data-pending={!photo.id || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt="" />
              <button
                type="button"
                onClick={() => removePhoto(photo.tempId)}
                aria-label="Прибрати фото"
              >
                <X className="size-3" strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="dm-input-row">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => void addFiles(event.target.files)}
        />
        <button
          type="button"
          className="dm-attach"
          aria-label="Додати фото"
          disabled={photos.length >= CHAT_PHOTOS_MAX}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-4" strokeWidth={2} />
        </button>
        <label htmlFor="inbox-input" className="sr-only">
          Повідомлення
        </label>
        <textarea
          id="inbox-input"
          rows={1}
          value={draft}
          maxLength={CHAT_TEXT_MAX}
          onChange={(event) => {
            setDraft(event.target.value);
            chat.onType();
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          onFocus={() => setOrdersOpen(false)}
          placeholder={
            chat.lines.length === 0 && !conversation.lastMessage
              ? "Опишіть задачу"
              : "Повідомлення"
          }
          className="dm-input"
        />
        <button
          type="submit"
          disabled={(!draft.trim() && ready.length === 0) || uploading}
          aria-label="Надіслати"
          className="dm-send"
        >
          <ArrowUp className="size-4" strokeWidth={2.4} />
        </button>
      </form>
      {viewer && <PhotoViewer url={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}

/** Фото з чату поверх усього: крестик, Esc і дотик по фону закривають. */
function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return createPortal(
    <div
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Фото"
      onClick={onClose}
    >
      <button
        type="button"
        className="photo-viewer-close"
        aria-label="Закрити фото"
        onClick={onClose}
      >
        <X className="size-5" strokeWidth={2.2} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Фото з чату"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

const MONEY = new Intl.NumberFormat("uk-UA");

/** Фото, додане до повідомлення, що ще не надіслано; id зʼявляється, коли воно вже на сервері. */
interface StagedPhoto {
  tempId: string;
  preview: string;
  id?: string;
}

/**
 * Шапка розмови: що зараз обговорюємо. Одне замовлення — рядок із назвою й станом,
 * кілька — «N замовлень» і лічильник тих, що чекають на мене. Розгортається:
 * виконавцю з діями за угодою, замовнику зі списком станів.
 */
function OrdersBar({
  conversation,
  response,
  open,
  onOpenChange,
}: {
  conversation: ConversationDto;
  response?: OfferResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [orders, setOrders] = useState<ConversationOrderDto[]>([]);
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchOrders(conversation.id)
        .then((list) => !cancelled && setOrders(list))
        .catch(() => {})
        .finally(() => !cancelled && setReady(true));
    };
    load();
    const stop = startPolling(load, 8000, ["deal", "message"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [conversation.id]);

  // Пока заказы не прийшли, не вгадуємо стан: показуємо індикатор, а не «Запропонувати угоду».
  if (!ready) {
    return (
      <div className="inbox-orders" aria-busy="true">
        <div className="inbox-orders-toggle" role="status">
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          <span className="inbox-orders-line">
            <span>Завантажуємо замовлення…</span>
          </span>
        </div>
      </div>
    );
  }
  const waiting = orders.filter((order) => order.needsMe).length;
  const single = orders.length === 1 ? orders[0] : null;
  return (
    <div className="inbox-orders" data-open={open || undefined}>
      <button
        type="button"
        className="inbox-orders-toggle"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <FileText aria-hidden className="size-3.5" strokeWidth={2} />
        {orders.length === 0 && !response ? (
          <span className="inbox-orders-line">
            <strong>Оформити умови</strong>
            <span>Домовились про суму й строки? Зафіксуйте тут</span>
          </span>
        ) : orders.length === 0 && response ? (
          <span className="inbox-orders-line">
            <strong>Запропонувати угоду</strong>
            <span>
              {response.price === null
                ? "Ціна після обговорення"
                : `${MONEY.format(response.price)} ₴`}{" "}
              · {response.days} дн.
            </span>
          </span>
        ) : single ? (
          <span className="inbox-orders-line">
            <strong>{single.title}</strong>
            <span>
              {MONEY.format(single.total)} ₴ · {single.state}
            </span>
          </span>
        ) : (
          <span className="inbox-orders-line">
            <strong>{orders.length} замовлення</strong>
            <span>
              {waiting > 0 ? `${waiting} чекає на вас` : "усі в роботі"}
            </span>
          </span>
        )}
        {(single?.needsMe || waiting > 0) && (
          <span className="inbox-orders-dot" aria-hidden />
        )}
        <ChevronDown
          aria-hidden
          className="inbox-orders-chevron size-4"
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="inbox-orders-body">
          {creating || (orders.length === 0 && !response) ? (
            <TermsForm
              conversation={conversation}
              onDone={() => {
                setCreating(false);
                onOpenChange(true);
              }}
              onCancel={() => {
                setCreating(false);
                onOpenChange(false);
              }}
            />
          ) : (
            <div className="grid gap-3">
              {conversation.role === "performer" ? (
                <PerformerDeals conversationId={conversation.id} />
              ) : (
                <>
                  <DirectDeals conversation={conversation} />
                  {response && <DealTab response={response} />}
                  {!response && orders.some((order) => !order.direct) && (
                    <ul className="inbox-orders-list">
                      {orders
                        .filter((order) => !order.direct)
                        .map((order) => (
                          <li key={order.dealId}>
                            <p className="inbox-deal-head">
                              <strong>{order.title}</strong>
                              <span>{MONEY.format(order.total)} ₴</span>
                            </p>
                            <p className="inbox-deal-state">
                              Угода {order.number} · {order.state}
                            </p>
                          </li>
                        ))}
                    </ul>
                  )}
                </>
              )}
              <button
                type="button"
                className="inbox-orders-add"
                onClick={() => setCreating(true)}
              >
                + Нове замовлення
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STATE_TEXT: Record<string, string> = {
  pending: "Чекаємо оплату від замовника",
  claimed: "Замовник позначив оплату",
  funded: "Оплачено, можна працювати",
  delivered: "Здано, чекаємо підтвердження замовника",
  released: "Виплачено",
  disputed: "Відкрито спір",
  refunded: "Кошти повернено замовнику",
};

/** Угоди, які замовник запропонував виконавцю в цій розмові, і що з ними може зробити виконавець. */
function PerformerDeals({ conversationId }: { conversationId: string }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch(
        `/api/deals?as=performer&conversation=${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      )
        .then((response) =>
          response.ok ? (response.json() as Promise<{ deals: Deal[] }>) : null,
        )
        .then((data) => data && !cancelled && setDeals(data.deals))
        .catch(() => {});
    };
    load();
    const stop = startPolling(load, 4000, ["deal"]);
    return () => {
      cancelled = true;
      stop();
    };
  }, [conversationId]);

  const act = async (deal: Deal, action: PerformerAction) => {
    setBusy(`${deal.id}:${action}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/deals/${encodeURIComponent(deal.id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ as: "performer", action }),
        },
      );
      const data = (await response.json()) as {
        deal?: Deal;
        detail?: string;
        title?: string;
      };
      if (!response.ok || !data.deal)
        throw new ApiError(data.detail ?? data.title ?? "Дію не виконано.");
      const next = data.deal;
      setDeals((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Немає зв'язку. Спробуйте ще раз.",
      );
    } finally {
      setBusy(null);
    }
  };

  const live = deals.filter(
    (deal) => deal.status !== "declined" && deal.status !== "cancelled",
  );
  if (live.length === 0) return null;
  return (
    <div className="inbox-deals">
      {live.map((deal) => {
        const needs = performerNeeds(deal);
        const stage = currentStage(deal);
        return (
          <article key={deal.id} className="inbox-deal">
            <p className="inbox-deal-head">
              <strong>
                {deal.title ? `${deal.title} · ` : "Угода "}
                {deal.number}
              </strong>
              <span>
                {MONEY.format(dealTotal(deal))} ₴
                {deal.method === "safe"
                  ? `, вам ${MONEY.format(payoutOf(dealTotal(deal), "safe"))} ₴`
                  : ""}
              </span>
            </p>
            <p className="inbox-deal-state">
              {deal.status === "proposed"
                ? deal.proposedBy === "performer"
                  ? "Чекаємо відповіді замовника"
                  : "Замовник пропонує угоду"
                : deal.status === "completed"
                  ? "Завершено"
                  : stage
                    ? `${stage.title}: ${STATE_TEXT[stage.status] ?? stage.status}`
                    : ""}
            </p>
            {deal.status === "proposed" && deal.proposedBy === "performer" && (
              <div className="inbox-deal-actions">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(deal, "withdraw")}
                  className="dr-close inbox-deal-alt"
                >
                  Відкликати умови
                </button>
              </div>
            )}
            {needs === "answer" && (
              <div className="inbox-deal-actions">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(deal, "accept")}
                  className="dm-send inbox-deal-main"
                >
                  Прийняти
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(deal, "decline")}
                  className="dr-close inbox-deal-alt"
                >
                  Відхилити
                </button>
              </div>
            )}
            {needs === "confirm" && (
              <div className="inbox-deal-actions">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(deal, "confirm_paid")}
                  className="dm-send inbox-deal-main"
                >
                  Підтвердити отримання оплати
                </button>
              </div>
            )}
            {needs === "deliver" && (
              <div className="inbox-deal-actions">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(deal, "deliver")}
                  className="dm-send inbox-deal-main"
                >
                  Здати етап
                </button>
              </div>
            )}
          </article>
        );
      })}
      {error && <p className="dm-warn">{error}</p>}
    </div>
  );
}
