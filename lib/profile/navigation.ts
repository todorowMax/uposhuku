"use client";

// lib/profile/navigation.ts
//
// Профіль виконавця має власну адресу /p/[id]. З карти він відкривається
// поверх неї без перезавантаження, а пряме посилання показує той самий екран.
// Закриття: якщо людина прийшла з застосунку, повертаємось назад по історії,
// якщо відкрила посилання, ведемо на головну.

import { useRouter } from "next/navigation";
import { useCallback } from "react";

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
