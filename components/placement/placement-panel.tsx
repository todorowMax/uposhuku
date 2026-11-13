"use client";

// components/placement/placement-panel.tsx
//
// «Стати на карту»: разова оплата розміщення. Без оплати людини на карті немає (вона лише відгукується на запити).
// Від 100 ₴ вона зʼявляється, а далі розмір маркера й місце серед пропозицій залежать від суми. Ціни рівнів
// динамічні: рівень діє, поки інші не заплатили більше. Показуємо те, що людина отримує: маркер у справжньому
// розмірі, позначку «Просування» (закон «Про рекламу») і попередження, що розмір можуть перебити.
// Це екран (DESIGN.md, «Шари»), вибір рівня всередині; логіка в `use-placement-flow.ts`, кроки в `parts/`.

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { Loader2 } from "@/components/icons";
import { PlacementCheckout } from "@/components/placement/parts/placement-checkout";
import { PlacementFaces } from "@/components/placement/parts/placement-faces";
import { PlacementHistory } from "@/components/placement/parts/placement-history";
import { PlacementShell, closePlacement } from "@/components/placement/parts/placement-shell";
import { PlacementTiers } from "@/components/placement/parts/placement-tiers";
import { usePlacementFlow } from "@/components/placement/use-placement-flow";
import type { PlacementReturn } from "@/components/placement/use-placement-return";
import { Button } from "@/components/ui/button";
import { getPerformers } from "@/lib/map/performers";
import type { PlacementTier } from "@/lib/map/types";
import { placementStore } from "@/lib/placement/client";
import { TIER_NAMES, TIER_PX } from "@/lib/placement/tiers";
import { profileEditorStore, profileStore } from "@/lib/profile/client";
import { focusPerformerStore } from "@/lib/requests/offers";
import { useStore } from "@/lib/store";
import { openAfterLayers } from "@/lib/ui/use-layer-history";

export namespace PlacementScreenTypes {
  export type Props = { returnState: PlacementReturn | null; dismiss: () => void };
}

const PRICE = new Intl.NumberFormat("uk-UA");
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const PlacementScreen = ({ returnState, dismiss }: PlacementScreenTypes.Props) => {
  const profileState = useStore(profileStore);
  const placement = useStore(placementStore);
  const profile = profileState.status === "ready" ? profileState.profile : null;
  if (returnState) return <ReturnResult state={returnState} name={profile?.name ?? ""} photo={profile?.photo ?? ""} tier={placement?.tier ?? 1} retry={dismiss} />;
  if (!profile?.published) return <NeedProfile />;
  return <Chooser photo={profile.photo} name={profile.name} />;
};

const NeedProfile = () => (
  <PlacementShell
    title="Стати на карту"
    footer={
      <Button
        className="w-full"
        onClick={() => {
          closePlacement();
          openAfterLayers(() => profileEditorStore.set(true));
        }}
      >
        Заповнити профіль
      </Button>
    }
  >
    <p className="auth-lead">Спершу заповніть і опублікуйте профіль: маркер, який росте з оплатою, це ваше фото на карті.</p>
  </PlacementShell>
);

const Chooser = ({ photo, name }: { photo: string; name: string }) => {
  const flow = usePlacementFlow();
  const { placement, step, current, amount } = flow;
  const toTiers = () => flow.setStep("choose");
  const back = (label: string, onClick: () => void) => (
    <Button variant="quiet" onClick={onClick}>
      {label}
    </Button>
  );

  if (flow.history && placement) {
    return (
      <PlacementShell title="Мої платежі" action={back("Назад", () => flow.setHistory(false))}>
        <PlacementHistory payments={placement.payments} />
      </PlacementShell>
    );
  }

  if (step === "checkout" || step === "processing") {
    const processing = step === "processing";
    return (
      <PlacementShell
        title="Оплата"
        action={processing ? undefined : back("До рівнів", toTiers)}
        footer={
          <Button className="w-full" disabled={processing || !flow.agreed} onClick={() => void flow.pay()}>
            {processing && <Loader2 className="size-4 animate-spin" />}
            {processing ? "Переходимо до оплати…" : `Оплатити ${PRICE.format(amount)} ₴`}
          </Button>
        }
      >
        <PlacementCheckout amount={amount} tierAfter={flow.tierAfter} agreed={flow.agreed} processing={processing} onAgree={flow.setAgreed} />
      </PlacementShell>
    );
  }

  if (step === "failed") {
    return (
      <PlacementShell
        title="Оплата не пройшла"
        action={back("До рівнів", toTiers)}
        footer={
          <Button className="w-full" onClick={() => flow.setStep("checkout")}>
            Спробувати ще раз
          </Button>
        }
      >
        <p role="alert" className="auth-error text-sm leading-relaxed">
          {flow.error}
        </p>
      </PlacementShell>
    );
  }

  return (
    <PlacementShell
      title="Зʼявитися на карті"
      footer={
        current < 6 ? (
          <Button className="w-full place-publish" onClick={() => flow.setStep("checkout")}>
            Опублікуватися на карті
          </Button>
        ) : undefined
      }
    >
      <header className="place-hero">
        <PlacementFaces people={flow.others} photo={photo} name={name} />
        <p className="place-hero-lead">Хочете, щоб вас бачили на карті й помічали серед перших? Опублікуйте свій профіль прямо тут.</p>
      </header>
      <PlacementTiers current={current} selected={flow.selected} needed={flow.needed} photo={photo} name={name} onSelect={flow.select} />
      {current >= 6 && <p className="auth-lead text-center">Ви на найвищому рівні. Більшого маркера немає.</p>}
      <p className="pe-hint place-footnote">
        Оплата разова й не залежить від кількості відгуків. Сума накопичується: докупити можна будь-коли.
        {placement && placement.payments.length > 0 && (
          <>
            {" "}
            <Button variant="link" className="text-xs" onClick={() => flow.setHistory(true)}>
              Мої платежі
            </Button>
          </>
        )}
      </p>
    </PlacementShell>
  );
};

const ReturnResult = ({ state, name, photo, tier, retry }: { state: PlacementReturn; name: string; photo: string; tier: PlacementTier; retry: () => void }) => {
  if (state === "paid") return <Done name={name} photo={photo} tier={tier} />;
  if (state === "failed") {
    return (
      <PlacementShell
        title="Оплата не пройшла"
        footer={
          <Button className="w-full" onClick={retry}>
            Спробувати ще раз
          </Button>
        }
      >
        <p role="alert" className="auth-error">
          Оплата не пройшла, гроші не списано.
        </p>
      </PlacementShell>
    );
  }
  const pending = state === "pending";
  return (
    <PlacementShell
      title={pending ? "Оплату не підтверджено" : "Перевіряємо оплату"}
      footer={
        pending ? (
          <Button variant="secondary" className="w-full" onClick={retry}>
            Оплатити ще раз
          </Button>
        ) : undefined
      }
    >
      <p role="status" className="auth-lead">
        {pending ? "Банк поки не підтвердив оплату. Якщо ви оплатили, рівень оновиться сам за хвилину-дві. Якщо закрили сторінку банку, гроші не списано." : "Чекаємо підтвердження від банку…"}
      </p>
      {!pending && <Loader2 className="mx-auto size-5 animate-spin text-ink-muted" aria-hidden="true" />}
    </PlacementShell>
  );
};

const Done = ({ name, photo, tier }: { name: string; photo: string; tier: PlacementTier }) => {
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
    <PlacementShell
      title="Ви на карті"
      footer={
        <div className="grid gap-2">
          <Button
            onClick={() => {
              closePlacement();
              const performer = getPerformers().find((person) => person.mine);
              if (performer) focusPerformerStore.set({ id: performer.id, at: Date.now() });
            }}
          >
            Показати на карті
          </Button>
          <Button variant="secondary" onClick={closePlacement}>
            Закрити
          </Button>
        </div>
      }
    >
      <div className="grid justify-items-center gap-3 py-2">
        <span ref={dotRef} className="place-dot place-dot-big" style={{ width: size, height: size, ...(photo ? { backgroundImage: `url(${photo})` } : null) }}>
          {!photo && <span className="text-lg font-semibold text-ink-muted">{name.trim().charAt(0) || "?"}</span>}
        </span>
        <p className="text-center text-sm leading-relaxed text-ink-muted">
          Рівень {tier} з 6: <strong className="font-semibold text-ink">{TIER_NAMES[tier]}</strong>. Ваш маркер уже на карті, а замовники бачать вас вище в пропозиціях.
        </p>
      </div>
    </PlacementShell>
  );
};
