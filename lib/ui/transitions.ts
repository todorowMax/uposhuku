// lib/ui/transitions.ts
//
// Готові рухи GSAP з однієї шкали (lib/ui/motion-tokens.ts, DESIGN.md «Motion»). Новий код бере рух звідси, а не
// пише власні тривалість і криву. Файл тягне GSAP, тому імпортується лише з компонентів, що вже завантажуються
// ліниво або самі анімують (MOT-6). З `prefers-reduced-motion` зсув прибирається, проявлення лишається (MOT-3).

import { gsap } from "gsap";
import { prefersReducedMotion } from "./media";
import { DURATION_MS, EASE_GSAP, SHIFT_PX, STAGGER_MS } from "./motion-tokens";

const seconds = (ms: number) => ms / 1000;

/** Звідки шар приїжджає: з того краю, де він живе. */
export type LayerEdge = "right" | "bottom";

/** Початковий стан шару: зсув від свого краю й прозорість; без руху лише прозорість. */
export const layerStart = (edge: LayerEdge, reduced: boolean): gsap.TweenVars => {
  if (reduced) return { opacity: 0 };
  return edge === "bottom" ? { y: SHIFT_PX.layer, opacity: 0 } : { x: SHIFT_PX.layer, opacity: 0 };
};

/**
 * Шар (панель, шторка) входить від свого краю. Після появи `transform` повертається CSS: інакше inline-стиль GSAP
 * глушить зсув свайпом (`--sheet-drag`).
 */
export const enterLayer = (target: gsap.TweenTarget, edge: LayerEdge): gsap.core.Tween =>
  gsap.fromTo(target, layerStart(edge, prefersReducedMotion()), {
    x: 0,
    y: 0,
    opacity: 1,
    duration: seconds(DURATION_MS.enter),
    ease: EASE_GSAP.enter,
    clearProps: "transform",
  });

/** Нові елементи списку проявляються по черзі; ті, що вже стоять, не чіпаємо (передавати лише нові). */
export const revealItems = (targets: gsap.TweenTarget): gsap.core.Tween =>
  gsap.fromTo(targets, prefersReducedMotion() ? { opacity: 0 } : { opacity: 0, y: SHIFT_PX.item }, {
    opacity: 1,
    y: 0,
    duration: seconds(DURATION_MS.enter),
    stagger: seconds(STAGGER_MS),
    ease: EASE_GSAP.reveal,
  });
