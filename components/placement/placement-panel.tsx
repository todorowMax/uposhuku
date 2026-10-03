"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { ArrowLeft, Check, Loader2, MapPin, Scale, ShieldCheck, X } from "lucide-react";
import { ApiError, sessionStore } from "@/lib/auth/client";
import { getPerformers, usePerformers } from "@/lib/map/performers";
import type { PlacementTier } from "@/lib/map/types";
import { loadPlacement, payForPlacement, placementOpenStore, placementStore } from "@/lib/placement/client";
import { MAX_PAYMENT, MIN_PAYMENT, TIER_FLOOR, tierFor } from "@/lib/placement/pricing";
import { PAID_TIERS, TIER_NAMES, TIER_PX, outrank } from "@/lib/placement/tiers";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { focusPerformerStore } from "@/lib/requests/offers";
import { useStore } from "@/lib/store";

const PRICE = new Intl.NumberFormat("uk-UA");
const DATE = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Step = "choose" | "checkout" | "processing" | "done" | "failed";

/**
 * «Стати на карту»: разова оплата розміщення. Без оплати людини на карті
 * немає (вона лише відгукується на запити). Від 100 ₴ вона з'являється, а
 * далі розмір маркера й місце серед пропозицій залежать від суми. Ціни
 * рівнів динамічні: рівень діє, поки інші не заплатили більше. Показуємо
 * те, що людина отримує: маркер у справжньому розмірі, скільки виконавців
 * нижче, позначку «Просування» (закон «Про рекламу») і попередження, що
 * розмір можуть перебити.
 */
export function PlacementPanel() {
  const open = useStore(placementOpenStore);
  const session = useStore(sessionStore);
  const profileState = useStore(profileStore);
  if (!open || session.status !== "user") return null;
  const profile = profileState.status === "ready" ? profileState.profile : null;
  if (!profile?.published) return <NeedProfile />;
  return <Chooser photo={profile.photo} name={profile.name} />;
}

const close = () => placementOpenStore.set(false);

function Shell({ title, back, children }: { title: string; back?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current || reduced()) return;
    const tween = gsap.fromTo(ref.current, { opacity: 0, y: 18, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: "power3.out" });
    return () => {
      tween.kill();
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <div aria-hidden className="auth-scrim place-scrim" onClick={close} />
      <div className="place-wrap">
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="place-panel glass-panel">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {back && (
              <button type="button" onClick={back} aria-label="Назад" className="auth-icon-button -ml-1.5">
                <ArrowLeft className="size-4" strokeWidth={2} />
              </button>
            )}
            <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          </div>
          <button type="button" onClick={close} aria-label="Закрити" className="auth-icon-button -mr-1.5">
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
      </div>
    </>
  );
}

function NeedProfile() {
  return (
    <Shell title="Стати на карту">
      <p className="auth-lead">Спершу заповніть і опублікуйте профіль: маркер, який росте з оплатою, це ваше фото на карті.</p>
      <button
        type="button"
        className="auth-primary"
        onClick={() => {
          close();
          profileEditorStore.set(true);
        }}
      >
        Заповнити профіль
      </button>
    </Shell>
  );
}

function Chooser({ photo, name }: { photo: string; name: string }) {
  const placement = useStore(placementStore);
  const performers = usePerformers();
  const total = placement?.total ?? 0;
  const prices = placement?.prices ?? TIER_FLOOR;
  const current = placement?.tier ?? tierFor(total, prices);
  const offMap = current < 2;
  const firstUp = (offMap ? 2 : Math.min(6, current + 1)) as PlacementTier;
  const [selected, setSelected] = useState<PlacementTier>(current === 6 ? 6 : firstUp);
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // Ціни залежать від інших, тож перед вибором беремо свіжі.
  useEffect(() => {
    void loadPlacement();
  }, []);

  const others = useMemo(() => performers.filter((person) => !person.mine), [performers]);
  const needed = (tier: PlacementTier) => (tier < 2 ? 0 : Math.min(MAX_PAYMENT, Math.max(MIN_PAYMENT, prices[tier as keyof typeof prices] - total)));
  const amount = needed(selected);
  const tierAfter = tierFor(total + amount, prices);
  const below = outrank(selected, others);

  const pay = async (outcome: "success" | "declined") => {
    setStep("processing");
    setError(null);
    // Чесна пауза, як у справжньому банку: видно, що щось відбувається.
    await new Promise((resolve) => window.setTimeout(resolve, 1100));
    try {
      await payForPlacement(amount, outcome);
      setStep("done");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не вдалося провести оплату.");
      setStep("failed");
    }
  };

  if (history && placement) {
    return (
      <Shell title="Мої платежі" back={() => setHistory(false)}>
        <ul className="grid gap-1.5">
          {placement.payments.map((payment) => (
            <li key={payment.id} className="place-row">
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold tabular-nums text-ink">{PRICE.format(payment.amount)} ₴</span>
                <span className="block text-[11px] text-ink-muted">{DATE.format(new Date(payment.createdAt))}</span>
              </span>
              <span className="text-[12px] text-ink-muted">Рівень {payment.tierAfter}: {TIER_NAMES[payment.tierAfter]}</span>
            </li>
          ))}
        </ul>
        <p className="pe-hint">Квитанції надійдуть на пошту, коли підключимо Monobank.</p>
      </Shell>
    );
  }

  if (step === "checkout" || step === "processing") {
    return (
      <Shell title="Оплата" back={step === "checkout" ? () => setStep("choose") : undefined}>
        <div className="place-checkout">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Monobank · тестовий режим</p>
          <p className="mt-2 text-[28px] font-semibold tabular-nums text-ink">{PRICE.format(amount)} ₴</p>
          <p className="text-[12px] text-ink-muted">Розміщення на карті, рівень {tierAfter}: {TIER_NAMES[tierAfter]}</p>
        </div>
        <label className="consent">
          <input type="checkbox" checked={agreed} disabled={step === "processing"} onChange={(event) => setAgreed(event.target.checked)} />
          <span>
            Погоджуюсь з <a href="/offer" target="_blank" rel="noreferrer">договором публічної оферти</a> і прошу змінити рівень розміщення одразу після оплати. Розумію, що протягом 14 днів можу попросити повернення коштів.
          </span>
        </label>
        <p className="auth-mock">Справжня оплата ще не підключена. У бойовому режимі тут відкриється сторінка Monobank, а рівень зміниться після підтвердження банку.</p>
        <div className="grid gap-2">
          <button type="button" disabled={step === "processing" || !agreed} onClick={() => void pay("success")} className="auth-primary">
            {step === "processing" && <Loader2 className="size-4 animate-spin" />}
            {step === "processing" ? "Проводимо платіж…" : "Оплатити (тест)"}
          </button>
          <button type="button" disabled={step === "processing" || !agreed} onClick={() => void pay("declined")} className="auth-secondary">
            Імітувати відмову банку
          </button>
        </div>
      </Shell>
    );
  }

  if (step === "done") return <Done name={name} photo={photo} tier={placement?.tier ?? tierAfter} />;

  if (step === "failed") {
    return (
      <Shell title="Оплата не пройшла" back={() => setStep("choose")}>
        <p role="alert" className="auth-error text-[13px] leading-relaxed">
          {error}
        </p>
        <button type="button" onClick={() => setStep("checkout")} className="auth-primary">
          Спробувати ще раз
        </button>
        <button type="button" onClick={() => setStep("choose")} className="auth-secondary">
          Змінити рівень
        </button>
      </Shell>
    );
  }

  return (
    <Shell title="Стати на карту">
      <p className="auth-lead">
        {offMap
          ? "Без оплати вас не видно на карті. Від 100 ₴ ваше фото з'явиться на ній, а чим більше платите, тим більший маркер і вище ваш відгук у списку замовника. Відгукуватися на запити можна й без оплати."
          : "Разова оплата: маркер більшає на карті, а у списку пропозицій замовникові ви стоїте вище за тих, хто платив менше."}
      </p>

      <Ladder photo={photo} name={name} selected={selected} current={current} />

      <fieldset className="place-tiers">
        <legend className="sr-only">Рівень розміщення</legend>
        {PAID_TIERS.map((tier) => {
          const owned = tier <= current;
          return (
            <label key={tier} className="place-tier" data-selected={tier === selected || undefined} data-owned={owned || undefined}>
              <input type="radio" name="tier" value={tier} checked={tier === selected} disabled={owned} onChange={() => setSelected(tier)} />
              <span className="place-tier-name">{TIER_NAMES[tier]}</span>
              <span className="place-tier-price">{owned ? (tier === current ? "ваш рівень" : "є") : `${PRICE.format(needed(tier))} ₴`}</span>
            </label>
          );
        })}
      </fieldset>

      <p className="place-warn" role="note">
        <Scale className="size-4 shrink-0" strokeWidth={1.9} />
        <span>
          Розмір діє, поки вас не перебили. Ціни рівнів залежать від того, скільки платять інші виконавці. Якщо хтось заплатить більше, ваш маркер може зменшитись, і тоді його можна повернути доплатою.
        </span>
      </p>

      <ul className="place-facts">
        <li>
          <MapPin className="size-4 shrink-0" strokeWidth={1.9} />
          {offMap ? `Ви з'явитесь на карті з маркером ${TIER_PX[selected - 1]} px.` : `Маркер ${TIER_PX[selected - 1]} px замість ${TIER_PX[current - 1]}.`}
        </li>
        {below > 0 && (
          <li>
            <Check className="size-4 shrink-0" strokeWidth={2.4} />
            Вище за {below} з {others.length} виконавців.
          </li>
        )}
        <li>
          <ShieldCheck className="size-4 shrink-0" strokeWidth={1.9} />
          Біля імені позначка «Просування»: так вимагає закон «Про рекламу».
        </li>
      </ul>

      {current < 6 ? (
        <button type="button" onClick={() => setStep("checkout")} className="auth-primary">
          Сплатити {PRICE.format(amount)} ₴
        </button>
      ) : (
        <p className="auth-lead text-center">Ви на найвищому рівні. Більшого маркера немає.</p>
      )}
      <p className="pe-hint">
        Оплата разова й не залежить від кількості відгуків. Сума накопичується: докупити можна будь-коли.
        {placement && placement.payments.length > 0 && (
          <>
            {" "}
            <button type="button" onClick={() => setHistory(true)} className="auth-link text-[12px]">
              Мої платежі
            </button>
          </>
        )}
      </p>
    </Shell>
  );
}

/**
 * Драбина рівнів: шість маркерів від найменшого до найбільшого, у справжній
 * пропорції (×1,6). Вибраний — з вашим фото, поточний — з тонким кільцем.
 */
function Ladder({ photo, name, selected, current }: { photo: string; name: string; selected: PlacementTier; current: PlacementTier }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const node = ref.current?.querySelector<HTMLElement>(`[data-tier="${selected}"] .place-dot`);
    if (!node) return;
    if (first.current || reduced()) {
      first.current = false;
      return;
    }
    const tween = gsap.fromTo(node, { scale: 0.8 }, { scale: 1, duration: 0.45, ease: "back.out(2.4)" });
    return () => {
      tween.kill();
    };
  }, [selected]);
  return (
    <div ref={ref} className="place-ladder" role="img" aria-label={`Рівень ${selected} з 6: маркер ${TIER_PX[selected - 1]} пікселів`}>
      {([1, 2, 3, 4, 5, 6] as PlacementTier[]).map((tier) => {
        const size = Math.round(TIER_PX[tier - 1] * 1.6);
        const you = tier === selected;
        return (
          <div key={tier} data-tier={tier} className="place-step" data-you={you || undefined} data-current={tier === current || undefined}>
            <span
              className="place-dot"
              style={{
                width: size,
                height: size,
                ...(you && photo ? { backgroundImage: `url(${photo})` } : null),
              }}
            >
              {you && !photo && <span className="text-[13px] font-semibold text-ink-muted">{name.trim().charAt(0) || "?"}</span>}
            </span>
            <span className="place-step-label">{tier === current ? (current < 2 ? "Не на карті" : "Зараз") : you ? "Буде" : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function Done({ name, photo, tier }: { name: string; photo: string; tier: PlacementTier }) {
  const dotRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!dotRef.current || reduced()) return;
    const tween = gsap.fromTo(dotRef.current, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2.2)" });
    return () => {
      tween.kill();
    };
  }, []);
  const size = Math.round(TIER_PX[tier - 1] * 1.8);
  return (
    <Shell title="Ви на карті">
      <div className="grid justify-items-center gap-3 py-2">
        <span ref={dotRef} className="place-dot place-dot-big" style={{ width: size, height: size, ...(photo ? { backgroundImage: `url(${photo})` } : null) }}>
          {!photo && <span className="text-[18px] font-semibold text-ink-muted">{name.trim().charAt(0) || "?"}</span>}
        </span>
        <p className="text-center text-[13px] leading-relaxed text-ink-muted">
          Рівень {tier} з 6: <strong className="font-semibold text-ink">{TIER_NAMES[tier]}</strong>. Ваш маркер уже на карті, а замовники бачать вас вище в пропозиціях.
        </p>
      </div>
      <button
        type="button"
        className="auth-primary"
        onClick={() => {
          close();
          const performer = getPerformers().find((person) => person.mine);
          if (performer) focusPerformerStore.set({ id: performer.id, at: Date.now() });
        }}
      >
        Показати на карті
      </button>
      <button type="button" className="auth-secondary" onClick={close}>
        Закрити
      </button>
    </Shell>
  );
}
