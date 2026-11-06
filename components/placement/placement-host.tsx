"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { placementOpenStore } from "@/lib/placement/client";
import { useStore } from "@/lib/store";
import { usePlacementReturn } from "./use-placement-return";

// Саму панель (вибір рівня, оплата, результат) вантажимо, коли вона відкривається.
// Повернення з оплати (`?placement=`) читає хук тут, тому він живе в layout одразу.
const PlacementDialog = dynamic(() => import("./placement-panel").then((module) => module.PlacementDialog), { ssr: false });

/** Приводить «Стати на карту» в дію: відкриття зі сховища й повернення з банку. Сама панель у `placement-panel.tsx`. */
export const PlacementPanel = () => {
  const open = useStore(placementOpenStore);
  const session = useStore(sessionStore);
  const { state: returnState, dismiss } = usePlacementReturn();
  // Панель закрили: результат повернення більше не показуємо.
  useEffect(() => {
    if (!open && returnState) dismiss();
  }, [open, returnState, dismiss]);
  if (!open || session.status !== "user") return null;
  return <PlacementDialog returnState={returnState} dismiss={dismiss} />;
};
