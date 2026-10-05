"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { gsap } from "gsap";
import { ArrowLeft, ArrowUp, MessageCircle, X } from "lucide-react";
import { fetchConversations, useRemoteChat } from "@/lib/chat/client";
import { startPolling } from "@/lib/realtime/client";
import { CHAT_TEXT_MAX, type ConversationDto } from "@/lib/chat/types";
import { ApiError, sessionStore } from "@/lib/auth/client";
import { currentStage, dealTotal, payoutOf, performerNeeds } from "@/lib/deals/machine";
import type { Deal, PerformerAction } from "@/lib/deals/types";
import { mentionsContacts } from "@/lib/chat/contacts";
import { useStore } from "@/lib/store";

const TIME = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" });
const POLL_MS = 8000;

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
  const signedIn = session.status === "user";
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  // Панель розкривається з кнопки: розмір, форма й м'яке світіння.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!open || !panel) return;
    closing.current = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !button) return;
    const to = panel.getBoundingClientRect();
    const from = button.getBoundingClientRect();
    const timeline = gsap.timeline({ onComplete: () => gsap.set(panel, { clearProps: "left,top,width,height,right,bottom,borderRadius" }) });
    timeline.fromTo(panel, { right: "auto", bottom: "auto", left: from.left, top: from.top, width: from.width, height: from.height, borderRadius: 20 }, { left: to.left, top: to.top, width: to.width, height: to.height, borderRadius: 24, duration: 0.46, ease: "expo.out" }, 0);
    timeline.fromTo(innerRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.26, ease: "power2.out" }, 0.18);
    timeline.fromTo(glowRef.current, { opacity: 1 }, { opacity: 0, duration: 0.5, ease: "power2.inOut" }, 0.04);
    return () => {
      timeline.kill();
    };
  }, [open]);

  const close = () => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (closing.current) return;
    if (!panel || !button || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setOpen(false);
    closing.current = true;
    const from = panel.getBoundingClientRect();
    const to = button.getBoundingClientRect();
    gsap
      .timeline({ onComplete: () => setOpen(false) })
      .set(panel, { right: "auto", bottom: "auto", left: from.left, top: from.top, width: from.width, height: from.height })
      .to(innerRef.current, { opacity: 0, duration: 0.12, ease: "power1.in" }, 0)
      .to(glowRef.current, { opacity: 1, duration: 0.22, ease: "power2.in" }, 0.04)
      .to(panel, { left: to.left, top: to.top, width: to.width, height: to.height, borderRadius: 20, duration: 0.34, ease: "expo.inOut" }, 0.04);
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

  if (!signedIn || items.length === 0) return null;
  const asPerformer = items.filter((item) => item.role === "performer").length;

  return (
    <>
      {(
        <button ref={buttonRef} type="button" onClick={() => setOpen(true)} className="inbox-button" style={open ? { visibility: "hidden" } : undefined} aria-label={`Повідомлення: ${items.length}`}>
          <MessageCircle className="size-4" strokeWidth={1.9} />
          Повідомлення
          {asPerformer > 0 && <span className="inbox-badge">{asPerformer}</span>}
        </button>
      )}
      {open && (
        <section ref={panelRef} role="dialog" aria-label="Повідомлення" className="inbox-panel">
          <div ref={glowRef} className="dr-glow" data-soft aria-hidden />
          <div ref={innerRef} className="inbox-inner">
          {active ? (
            <Thread conversation={active} onBack={() => setActive(null)} onClose={close} />
          ) : (
            <>
              <header className="inbox-header">
                <h2>Повідомлення</h2>
                <button type="button" onClick={close} aria-label="Закрити" className="dr-close">
                  <X className="size-4" strokeWidth={2.2} />
                </button>
              </header>
              <ul className="inbox-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => setActive(item)} className="inbox-row">
                      <span className="inbox-name">
                        {item.other.name}
                        <em>{item.role === "performer" ? "замовник" : (item.other.specialty ?? "виконавець")}</em>
                      </span>
                      <span className="inbox-preview">{item.lastMessage ? item.lastMessage.text : "Без повідомлень"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          </div>
        </section>
      )}
    </>
  );
}

function Thread({ conversation, onBack, onClose }: { conversation: ConversationDto; onBack: () => void; onClose: () => void }) {
  const chat = useRemoteChat(conversation.performerId, true, undefined, { id: conversation.id, role: conversation.role });
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.lines.length]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void chat.send(text);
    setDraft("");
  };

  return (
    <>
      <header className="inbox-header">
        <button type="button" onClick={onBack} aria-label="До списку" className="dr-close">
          <ArrowLeft className="size-4" strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate">{conversation.other.name}</h2>
          {chat.typing && <p className="text-[11px] leading-tight text-ink-muted">друкує…</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Закрити" className="dr-close">
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </header>
      {conversation.role === "performer" && <PerformerDeals conversationId={conversation.id} />}
      <div ref={listRef} className="dm-scroll inbox-thread" aria-live="polite">
        {chat.lines.map((line) => (
          <div key={line.id} className="dm-bubble" data-from={line.from}>
            <p>{line.text}</p>
            <time dateTime={line.at}>{TIME.format(new Date(line.at))}</time>
          </div>
        ))}
        {chat.error && <p className="dm-warn">Немає зв'язку з сервером. Повідомлення підтягнуться, щойно він повернеться.</p>}
      </div>
      {mentionsContacts(draft) && <p className="dm-warn">Домовляйтеся тут: поза чатом ми не побачимо домовленостей.</p>}
      <form onSubmit={submit} className="dm-input-row">
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
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Повідомлення"
          className="dm-input"
        />
        <button type="submit" disabled={!draft.trim()} aria-label="Надіслати" className="dm-send">
          <ArrowUp className="size-4" strokeWidth={2.4} />
        </button>
      </form>
    </>
  );
}

const MONEY = new Intl.NumberFormat("uk-UA");

const STATE_TEXT: Record<string, string> = {
  pending: "Чекаємо оплату від замовника",
  claimed: "Замовник позначив оплату",
  funded: "Оплачено, можна працювати",
  delivered: "Здано, чекаємо підтвердження замовника",
  released: "Виплачено",
  disputed: "Відкрито спір",
};

/** Угоди, які замовник запропонував виконавцю в цій розмові, і що з ними може зробити виконавець. */
function PerformerDeals({ conversationId }: { conversationId: string }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetch(`/api/deals?as=performer&conversation=${encodeURIComponent(conversationId)}`, { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<{ deals: Deal[] }>) : null))
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
      const response = await fetch(`/api/deals/${encodeURIComponent(deal.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ as: "performer", action }) });
      const data = (await response.json()) as { deal?: Deal; detail?: string; title?: string };
      if (!response.ok || !data.deal) throw new ApiError(data.detail ?? data.title ?? "Дію не виконано.");
      const next = data.deal;
      setDeals((current) => current.map((item) => (item.id === next.id ? next : item)));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Немає зв'язку. Спробуйте ще раз.");
    } finally {
      setBusy(null);
    }
  };

  const live = deals.filter((deal) => deal.status !== "declined" && deal.status !== "cancelled");
  if (live.length === 0) return null;
  return (
    <div className="inbox-deals">
      {live.map((deal) => {
        const needs = performerNeeds(deal);
        const stage = currentStage(deal);
        return (
          <article key={deal.id} className="inbox-deal">
            <p className="inbox-deal-head">
              <strong>Угода {deal.number}</strong>
              <span>
                {MONEY.format(dealTotal(deal))} ₴{deal.method === "safe" ? `, вам ${MONEY.format(payoutOf(dealTotal(deal), "safe"))} ₴` : ""}
              </span>
            </p>
            <p className="inbox-deal-state">
              {deal.status === "proposed" ? "Замовник пропонує угоду" : deal.status === "completed" ? "Завершено" : stage ? `${stage.title}: ${STATE_TEXT[stage.status] ?? stage.status}` : ""}
            </p>
            {needs === "answer" && (
              <div className="inbox-deal-actions">
                <button type="button" disabled={busy !== null} onClick={() => void act(deal, "accept")} className="dm-send inbox-deal-main">
                  Прийняти
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void act(deal, "decline")} className="dr-close inbox-deal-alt">
                  Відхилити
                </button>
              </div>
            )}
            {needs === "confirm" && (
              <div className="inbox-deal-actions">
                <button type="button" disabled={busy !== null} onClick={() => void act(deal, "confirm_paid")} className="dm-send inbox-deal-main">
                  Підтвердити отримання оплати
                </button>
              </div>
            )}
            {needs === "deliver" && (
              <div className="inbox-deal-actions">
                <button type="button" disabled={busy !== null} onClick={() => void act(deal, "deliver")} className="dm-send inbox-deal-main">
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
