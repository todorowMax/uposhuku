"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { Check, Loader2, MapPin, MessageSquareText, X } from "lucide-react";
import { DirectChatPanel } from "@/components/profile/direct-chat";
import { PerformerAbout } from "@/components/maplibre/performer-about";
import { Stars } from "@/components/deals/deal-tab";
import { avatarBackground } from "@/lib/map/avatar-style";
import { CITIES } from "@/lib/map/cities";
import { usePerformers } from "@/lib/map/performers";
import { performerStats } from "@/lib/map/stats";
import type { Performer } from "@/lib/map/types";
import { placementOpenStore } from "@/lib/placement/client";
import { TIER_NAMES, isPromoted } from "@/lib/placement/tiers";
import { sessionStore } from "@/lib/auth/client";
import { useCloseProfile } from "@/lib/profile/navigation";
import { directChatOpenStore, useDialog, useDialogSync } from "@/lib/requests/direct-chat";
import { profileEditorStore } from "@/lib/profile/client";
import { profileToPerformer } from "@/lib/profile/to-performer";
import type { Profile } from "@/lib/profile/types";
import { fetchReviews } from "@/lib/reviews/client";
import { type Review } from "@/lib/reviews/types";
import { useStore } from "@/lib/store";

const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" });
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const reviewsWord = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) return "відгук";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return "відгуки";
  return "відгуків";
};

/** Виконавець за id: з карти, а для акаунтів, яких на карті ще немає, з /api/performers. */
const useViewedPerformer = (id: string | null, initial: Performer | null) => {
  const performers = usePerformers();
  const onMap = id ? performers.find((person) => person.id === id) : undefined;
  const [remote, setRemote] = useState<Performer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRemote(null);
    setFailed(false);
    if (!id || onMap || initial) return;
    let cancelled = false;
    void fetch(`/api/performers/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not found");
        return (await response.json()) as { profile: Profile; tier: number; userId: string };
      })
      .then(({ profile, tier, userId }) => {
        if (cancelled) return;
        const performer = profileToPerformer({ ...profile, published: true, updatedAt: "" }, userId, 0, tier as Performer["tier"]);
        if (performer) setRemote(performer);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id, onMap, initial]);

  return { performer: onMap ?? initial ?? remote, failed };
};

/**
 * Повний профіль виконавця: фото, цифри, «Про себе» без обрізання, роботи
 * сіткою (клік — опис, теги, посилання), теги й відгуки про роботу. Той
 * самий екран бачить сам виконавець у «Мій профіль → Як мене бачать».
 * Малює сторінка /p/[id]; `initial` і `initialLabels` приходять із сервера,
 * щоб у першому HTML уже був текст профілю.
 */
export function ProfileView({ id, initial, initialLabels = {} }: { id: string; initial: Performer | null; initialLabels?: Record<string, string> }) {
  const close = useCloseProfile();
  const session = useStore(sessionStore);
  const { performer: found, failed } = useViewedPerformer(id, initial);
  const mineId = session.status === "user" ? `me-${session.user.id}` : null;
  const mine = Boolean(found && (found.mine || found.id === mineId));
  const performer = useMemo(() => (found ? { ...found, mine } : null), [found, mine]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const composeButtonRef = useRef<HTMLButtonElement>(null);
  /** Панель «Описати задачу» / чат відкрита. */
  const [composing, setComposing] = useState(false);
  const dialog = useDialog(id);
  // Чи є вже розмова з цим виконавцем-акаунтом: від цього залежить напис кнопки.
  useDialogSync(id, true);
  const openRequest = useStore(directChatOpenStore);
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels);
  const [reviews, setReviews] = useState<{ list: Review[]; average: number | null } | null>(null);

  useLayoutEffect(() => {
    if (!overlayRef.current || reduced()) return;
    const tween = gsap.fromTo(overlayRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.28, ease: "power3.out" });
    return () => {
      tween.kill();
    };
  }, []);

  // Гість увійшов, і його чат створено: відкриваємо його без кнопки.
  useEffect(() => {
    if (openRequest !== id || !performer || performer.mine) return;
    directChatOpenStore.set(null);
    setComposing(true);
  }, [openRequest, id, performer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !composing) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, composing]);

  useEffect(() => {
    let cancelled = false;
    void fetchReviews(id)
      .then(({ reviews: list, average }) => !cancelled && setReviews({ list, average }))
      .catch(() => !cancelled && setReviews({ list: [], average: null }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tags = performer?.tags ?? [];
  const joined = tags.join(",");
  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    void import("@/lib/tags/engine").then((engine) => {
      if (!cancelled) setLabels(Object.fromEntries(joined.split(",").map((tag) => [tag, engine.tagLabel(tag)])));
    });
    return () => {
      cancelled = true;
    };
  }, [joined]);

  const stats = useMemo(() => (performer ? performerStats(performer) : null), [performer]);
  const city = performer ? CITIES.find((item) => item.id === performer.cityId)?.name : undefined;
  const proven = useMemo(() => new Set(performer?.works.flatMap((work) => work.tags ?? []) ?? []), [performer]);

  return (
    <div ref={overlayRef} role="dialog" aria-modal="true" aria-label={performer ? `Профіль: ${performer.name}` : "Профіль виконавця"} className="pe-overlay">
      <header className="pe-header">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[18px] font-semibold text-ink">{performer?.name ?? "Профіль виконавця"}</h1>
        </div>
        <button type="button" onClick={close} aria-label="Закрити" className="auth-icon-button shrink-0">
          <X className="size-5" strokeWidth={2} />
        </button>
      </header>

      <div className="pe-scroll">
        {!performer ? (
          <div className="grid place-items-center py-24 text-[13px] text-ink-muted">
            {failed ? <p>Профіль не знайдено. Можливо, виконавець зняв його з карти.</p> : <Loader2 className="size-6 animate-spin" />}
          </div>
        ) : (
          <div className="pv-layout">
            <section className="pe-section pv-head">
              <div className="pv-photo" role="img" aria-label={`Фото ${performer.name}`} style={avatarBackground(performer)} />
              <div className="min-w-0 flex-1">
                <p className="text-[20px] font-semibold leading-tight text-ink">{performer.name}</p>
                <p className="mt-1 text-[14px] text-ink-muted">{performer.specialty}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                  {city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" strokeWidth={2} />
                      {city}
                    </span>
                  )}
                  {isPromoted(performer.tier) && <span className="offer-promoted">Просування</span>}
                  <span>Розміщення: {TIER_NAMES[performer.tier]}</span>
                </p>
              </div>
            </section>

            <section className="pe-section" aria-label="Цифри">
              <div className="grid grid-cols-3 divide-x divide-[#b8c4c7]/55 text-center">
                <div>
                  <p className="text-[18px] font-semibold text-ink">{stats?.months} міс.</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">на платформі</p>
                </div>
                <div>
                  <p className="text-[18px] font-semibold text-ink">{stats?.orders}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">замовлень</p>
                </div>
                <div>
                  <p className="text-[18px] font-semibold text-ink">{reviews?.average ? `★ ${reviews.average}` : `★ ${stats?.rating}`}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">рейтинг</p>
                </div>
              </div>
            </section>

            <section className="pe-section">
              <PerformerAbout performer={performer} onOpenWork={() => {}} full />
              {!performer.bio && performer.works.length === 0 && <p className="text-[13px] text-ink-muted">Виконавець ще не додав опис і роботи.</p>}
            </section>

            {tags.length > 0 && (
              <section className="pe-section" aria-labelledby="pv-tags">
                <h2 id="pv-tags" className="pe-title">
                  Теги
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span key={tag} className="auth-draft-tag">
                      {proven.has(tag) && <Check className="mr-1 size-3 text-[#8e5f40]" strokeWidth={3} aria-label="Підтверджено роботою" />}
                      {labels[tag] ?? tag}
                    </span>
                  ))}
                </div>
                {proven.size > 0 && <p className="pe-hint">Галочка стоїть біля тегів, які підтверджує робота в портфоліо.</p>}
              </section>
            )}

            <section className="pe-section" aria-labelledby="pv-reviews">
              <div className="flex items-end justify-between gap-3">
                <h2 id="pv-reviews" className="pe-title">
                  Відгуки
                </h2>
                {reviews?.average && (
                  <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
                    <Stars value={reviews.average} />
                    <span className="font-semibold tabular-nums text-ink">{reviews.average.toFixed(1)}</span>· {reviews.list.length} {reviewsWord(reviews.list.length)}
                  </span>
                )}
              </div>
              {!reviews && <Loader2 className="size-5 animate-spin text-ink-muted" />}
              {reviews && reviews.list.length === 0 && (
                <p className="text-[13px] leading-relaxed text-ink-muted">Відгуків поки немає. Їх лишають замовники після завершеної угоди, тож накрутити неможливо.</p>
              )}
              <ul className="grid gap-3">
                {reviews?.list.map((review) => (
                  <li key={review.id} className="pv-review">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink">{review.author}</p>
                      <time dateTime={review.createdAt} className="text-[11px] text-ink-muted">
                        {DATE.format(new Date(review.createdAt))}
                      </time>
                    </div>
                    <Stars value={review.stars} size={13} />
                    {review.text && <p className="mt-1.5 text-[13px] leading-snug text-ink/90">{review.text}</p>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>

      {performer && (
        <footer className="pv-footer">
          {performer.mine ? (
            <>
              <button
                type="button"
                className="auth-primary"
                onClick={() => {
                  close();
                  profileEditorStore.set(true);
                }}
              >
                Редагувати профіль
              </button>
              <button
                type="button"
                className="auth-secondary"
                onClick={() => {
                  close();
                  placementOpenStore.set(true);
                }}
              >
                Підняти на карті
              </button>
            </>
          ) : (
            <button
              ref={composeButtonRef}
              type="button"
              className="auth-primary"
              style={composing ? { visibility: "hidden" } : undefined}
              aria-haspopup="dialog"
              onClick={() => setComposing(true)}
            >
              <MessageSquareText className="size-4" strokeWidth={1.9} />
              {dialog ? "Відкрити чат" : `Описати задачу для ${performer.name.split(" ")[0]}`}
            </button>
          )}
        </footer>
      )}

      {performer && composing && (
        <DirectChatPanel
          performer={performer}
          getOrigin={() => composeButtonRef.current?.getBoundingClientRect() ?? null}
          onClose={() => {
            setComposing(false);
            composeButtonRef.current?.focus();
          }}
          onLeaveToAuth={() => {
            setComposing(false);
            close();
          }}
        />
      )}
    </div>
  );
}
