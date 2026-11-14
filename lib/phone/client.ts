"use client";

// lib/phone/client.ts
//
// Телефон замовника в браузері: статус, початок підтвердження через бота, шторка «Підтвердіть телефон» (одна на всі входи)
// і обгортка, що повторює дію після підтвердження. Сервер сам перевіряє номер на кожній дії (lib/server/phone-gate.ts);
// клієнт лише вчасно показує шторку після 409 `phone_required`. Подія реалтайму `{ t: "phone" }` каже, що бот прийняв номер.

import { useEffect } from "react";
import { ApiError } from "@/lib/auth/client";
import { callApi } from "@/lib/deals/client";
import { onRealtime } from "@/lib/realtime/client";
import { createStore, useStore } from "@/lib/store";
import { PHONE_REQUIRED_CODE } from "./codes";

export namespace PhoneTypes {
  export type Status = { required: boolean; verified: boolean; mask: string | null; verifiedAt: number | null };
  /** `started`: бот уже надіслав кнопку в чат (`botUrl`); інакше треба спершу підключити Telegram (`linkUrl`). */
  export type Start = { started: boolean; botUrl?: string; linkUrl?: string };
  /** Хто чекає на підтвердження: `settle(true)` повторює дію, `settle(false)` скасовує. */
  export type Request = { settle: (verified: boolean) => void };
}

/** Останній відомий статус; null, поки не завантажено (або гість). */
export const phoneStatusStore = createStore<PhoneTypes.Status | null>(null);
/** Відкрита шторка; null, коли закрита. */
export const phoneSheetStore = createStore<PhoneTypes.Request | null>(null);

export const loadPhoneStatus = async (): Promise<PhoneTypes.Status | null> => {
  try {
    const status = await callApi<PhoneTypes.Status>("/api/phone");
    phoneStatusStore.set(status);
    return status;
  } catch {
    return null;
  }
};

/** Просить бота надіслати кнопку «Поділитися номером»; помилки сервера (409, 503) йдуть вгору з текстом для людини. */
export const startPhoneVerify = (): Promise<PhoneTypes.Start> => callApi<PhoneTypes.Start>("/api/phone/start", { method: "POST" });

export const forgetPhone = () => {
  phoneStatusStore.set(null);
  phoneSheetStore.set(null);
};

let waiting: Promise<boolean> | null = null;

/** Відкриває шторку й чекає: true, коли номер підтверджено, false, коли шторку закрили без цього. Виклики поспіль чекають одну відповідь. */
export const askPhone = (): Promise<boolean> => {
  waiting ??= new Promise<boolean>((resolve) => {
    phoneSheetStore.set({
      settle: (verified) => {
        phoneSheetStore.set(null);
        waiting = null;
        resolve(verified);
      },
    });
  });
  return waiting;
};

/** Відкриває шторку з меню акаунта: повертати нічого не треба. */
export const openPhoneSheet = () => void askPhone();

/** Виконує дію; відмова `phone_required` відкриває шторку й після підтвердження повторює дію один раз. */
export const withPhoneGate = async <T,>(action: () => Promise<T>): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiError && error.code === PHONE_REQUIRED_CODE && (await askPhone())) return action();
    throw error;
  }
};

/** Статус для меню: вантажить, коли його ще немає, і оновлюється подією реалтайму. Гість статусу не має. */
export const usePhoneStatus = (signedIn: boolean): PhoneTypes.Status | null => {
  const status = useStore(phoneStatusStore);
  useEffect(() => {
    if (!signedIn) {
      forgetPhone();
      return;
    }
    if (phoneStatusStore.get() === null) void loadPhoneStatus();
    return onRealtime((event) => {
      if (event.t === "phone") void loadPhoneStatus();
    });
  }, [signedIn]);
  return status;
};
