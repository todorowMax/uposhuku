"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { sessionStore } from "@/lib/auth/client";
import { feesOpenStore, forgetFees, refreshFees } from "@/lib/fees/client";
import { useStore } from "@/lib/store";
import { dismissFeesReturn, feesReturnStore, useFeesReturn } from "./use-fees-return";

// Сам екран вантажимо, коли він відкривається; рахунок для меню й повернення з банку живуть тут одразу.
const FeesScreen = dynamic(() => import("./fees-screen").then((module) => module.FeesScreen), { ssr: false });

/** Тримає рахунок комісії в сховищі, відкриває екран «Рахунок» і обробляє повернення з банку. Сам екран у `fees-screen.tsx`. */
export const FeesHost = () => {
  const session = useStore(sessionStore);
  const open = useStore(feesOpenStore);
  const returned = useStore(feesReturnStore);
  useFeesReturn();

  useEffect(() => {
    if (session.status === "user") void refreshFees();
    else if (session.status === "guest") forgetFees();
  }, [session.status]);

  // Екран закрили: результат повернення більше не показуємо.
  useEffect(() => {
    if (!open && returned) dismissFeesReturn();
  }, [open, returned]);

  if (!open || session.status !== "user") return null;
  return <FeesScreen />;
};
