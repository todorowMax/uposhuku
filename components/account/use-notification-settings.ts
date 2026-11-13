"use client";

// components/account/use-notification-settings.ts
//
// Стан екрана «Сповіщення»: дозвіл браузера, згода на статистику, стан Telegram і підписи до рядків. Перенесено
// з компонента без змін поведінки; розмітка в `notification-settings.tsx`.

import { useEffect, useState, useSyncExternalStore } from "react";
import { getConsent, onConsentChange, type Consent } from "@/kit/telemetry/client";
import { pushState, syncPrefsWithServer, usePrefs, type PushState } from "@/lib/notifications";
import { startPolling } from "@/lib/realtime/client";
import { loadTelegram, useTelegram } from "@/lib/telegram/link-client";

const pushHint = (push: PushState) => {
  if (push === "unsupported") return "Цей браузер не вміє показувати сповіщення.";
  if (push === "denied") return "Заблоковано в налаштуваннях браузера: дозвольте сповіщення для цього сайту.";
  return "Нагадаємо про нові пропозиції й запити, поки вкладка відкрита, але ви в іншій.";
};

const telegramHint = (telegram: ReturnType<typeof useTelegram>) => {
  if (!telegram.available) return "Особистий бот напише про нові пропозиції й повідомлення. Скоро.";
  if (telegram.error) return telegram.error;
  if (telegram.blocked) return "Бот заблокований у Telegram. Підключіть ще раз.";
  if (telegram.linked) return `Підключено${telegram.username ? `: @${telegram.username}` : ""}. Пишемо, коли ви не на сайті.`;
  if (telegram.waiting) return "Чекаємо підтвердження в Telegram: натисніть Start у боті.";
  return "Особистий бот напише про нові пропозиції, повідомлення й угоди, коли ви не на сайті.";
};

const subscribeConsent = (notify: () => void) => onConsentChange(() => notify());
const consentOnServer = (): Consent => "unknown";

/** Хук живе, поки екран відкритий: його викликає вміст екрана, а не сам екран, тож стан щоразу свіжий. */
export const useNotificationSettings = () => {
  const prefs = usePrefs();
  const telegram = useTelegram();
  const [push, setPush] = useState<PushState>(() => pushState());
  const consent = useSyncExternalStore(subscribeConsent, getConsent, consentOnServer);

  useEffect(() => {
    void syncPrefsWithServer();
    void loadTelegram();
  }, []);

  // Поки Telegram не підключено, слухаємо подію від бота; запасом опитуємо.
  useEffect(() => {
    if (telegram.linked) return;
    return startPolling(() => void loadTelegram(), telegram.waiting ? 4000 : 20_000, ["telegram"]);
  }, [telegram.linked, telegram.waiting]);

  return { prefs, push, setPush, consent, pushHint: pushHint(push), telegramHint: telegramHint(telegram) };
};
