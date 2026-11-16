"use client";

// lib/profile/navigation.ts
//
// Профіль виконавця має власну адресу /p/[id]. З карти він відкривається
// поверх неї без перезавантаження, а пряме посилання показує той самий екран.
// Закриття: якщо людина прийшла з застосунку, повертаємось назад по історії,
// якщо відкрила посилання, ведемо на головну.

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { afterLayerHistory } from "@/lib/ui/use-layer-history";

let openedInApp = false;

export const useOpenProfile = () => {
  const router = useRouter();
  return useCallback(
    (id: string) => {
      openedInApp = true;
      router.push(`/p/${encodeURIComponent(id)}`);
    },
    [router],
  );
};

export const useCloseProfile = () => {
  const router = useRouter();
  return useCallback(() => {
    if (openedInApp) {
      openedInApp = false;
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);
};

/** Що виконати, коли адреса профілю справді зникла: чат не відкриваємо, поки профіль ще стоїть під ним. */
let afterClose: (() => void) | null = null;

export const isProfilePath = (pathname: string) => pathname.startsWith("/p/");

/** Закрити профіль і лише потім виконати `then` (наприклад, відкрити чат з цим виконавцем). */
export const useCloseProfileThen = () => {
  const close = useCloseProfile();
  return useCallback(
    (then: () => void) => {
      afterClose = then;
      close();
    },
    [close],
  );
};

/**
 * Виконує відкладене `then` з `useCloseProfileThen`, щойно адреса вийшла з /p/…: роутер Next і історія шарів закінчили
 * перехід, тож шар чату не потрапить у його історію. Монтується один раз у шаблоні карти.
 */
export const useRunAfterProfileClose = () => {
  const pathname = usePathname();
  useEffect(() => {
    if (isProfilePath(pathname) || !afterClose) return;
    const run = afterClose;
    afterClose = null;
    afterLayerHistory(() => setTimeout(run, 0));
  }, [pathname]);
};
