"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, Mail, Send, X } from "@/components/icons";
import { BarChart3, Moon } from "lucide-react";
import { getConsent, onConsentChange, writeConsent, type Consent } from "@/kit/telemetry/client";
import { sessionStore } from "@/lib/auth/client";
import { enablePush, pushState, setPrefs, syncPrefsWithServer, usePrefs, type PushState } from "@/lib/notifications";
import { startPolling } from "@/lib/realtime/client";
import { cancelTelegramLink, disconnectTelegram, loadTelegram, startTelegramLink, useTelegram } from "@/lib/telegram/link-client";
import { createStore, useStore } from "@/lib/store";

export const notificationSettingsStore = createStore(false);

const close = () => notificationSettingsStore.set(false);

function Row({
  icon,
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="filter-switch notif-row" data-disabled={disabled || undefined}>
      <span className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-ink-muted">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[14px] font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-[12px] font-normal leading-snug text-ink-muted">{hint}</span>
        </span>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden className="filter-switch-track" />
    </label>
  );
}

/**
 * Куди писати, коли з'явилась пропозиція, повідомлення чи угода. Сповіщення
 * браузера працюють уже зараз, поки вкладка відкрита; пошта й Telegram —
 * налаштування наперед, самі канали підключимо з бекендом.
 */
export function NotificationSettings() {
  const open = useStore(notificationSettingsStore);
  const session = useStore(sessionStore);
  const prefs = usePrefs();
  const telegram = useTelegram();
  const [push, setPush] = useState<PushState>("default");
  const [consent, setConsent] = useState<Consent>("unknown");

  useEffect(() => {
    setConsent(getConsent());
    return onConsentChange(setConsent);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPush(pushState());
    void syncPrefsWithServer();
    void loadTelegram();
  }, [open]);

  // Поки панель відкрита й Telegram не підключено, слухаємо подію від бота; запасом опитуємо.
  useEffect(() => {
    if (!open || telegram.linked) return;
    return startPolling(() => void loadTelegram(), telegram.waiting ? 4000 : 20_000, ["telegram"]);
  }, [open, telegram.linked, telegram.waiting]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || session.status !== "user") return null;

  const pushHint =
    push === "unsupported"
      ? "Цей браузер не вміє показувати сповіщення."
      : push === "denied"
        ? "Заблоковано в налаштуваннях браузера: дозвольте сповіщення для цього сайту."
        : "Нагадаємо про нові пропозиції й запити, поки вкладка відкрита, але ви в іншій.";

  const telegramHint = !telegram.available
    ? "Особистий бот напише про нові пропозиції й повідомлення. Скоро."
    : telegram.error
      ? telegram.error
      : telegram.blocked
        ? "Бот заблокований у Telegram. Підключіть ще раз."
        : telegram.linked
          ? `Підключено${telegram.username ? `: @${telegram.username}` : ""}. Пишемо, коли ви не на сайті.`
          : telegram.waiting
            ? "Чекаємо підтвердження в Telegram: натисніть Start у боті."
            : "Особистий бот напише про нові пропозиції, повідомлення й угоди, коли ви не на сайті.";

  return (
    <>
      <div aria-hidden className="auth-scrim place-scrim" onClick={close} />
      <div className="place-wrap">
        <div role="dialog" aria-modal="true" aria-label="Сповіщення" className="place-panel glass-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-ink">Сповіщення</h2>
            <button type="button" onClick={close} aria-label="Закрити" className="auth-icon-button -mr-1.5">
              <X className="size-4" />
            </button>
          </div>
          <p className="auth-lead">Куди писати, коли з'явилась пропозиція, повідомлення чи угода, і про що саме.</p>

          <h3 className="pe-label">Де</h3>
          <div className="grid gap-1">
            <Row
              icon={<Mail className="size-[18px]" />}
              title="Пошта"
              hint={`Листи на ${session.user.email}. Надсилання підключимо разом із сервером.`}
              checked={prefs.channels.email}
              onChange={(email) => setPrefs({ channels: { email } })}
            />
            <Row
              icon={<Bell className="size-[18px]" />}
              title="Сповіщення в браузері"
              hint={pushHint}
              checked={prefs.channels.push && push === "granted"}
              disabled={push === "unsupported" || push === "denied"}
              onChange={(checked) => {
                if (!checked) {
                  setPrefs({ channels: { push: false } });
                  return;
                }
                void enablePush().then(setPush);
              }}
            />
            <TelegramRow hint={telegramHint} />
          </div>

          <h3 className="pe-label mt-2">Про що</h3>
          <div className="grid gap-1">
            <Row icon={<Send className="size-[18px]" />} title="Нові пропозиції на мій запит" hint="Виконавець відгукнувся на вашу задачу." checked={prefs.kinds.offers} onChange={(offers) => setPrefs({ kinds: { offers } })} />
            <Row icon={<Send className="size-[18px]" />} title="Повідомлення в чаті" hint="Вам відповіли чи написали першими." checked={prefs.kinds.messages} onChange={(messages) => setPrefs({ kinds: { messages } })} />
            <Row icon={<Send className="size-[18px]" />} title="Угоди" hint="Прийняли, оплатили, здали етап." checked={prefs.kinds.deals} onChange={(deals) => setPrefs({ kinds: { deals } })} />
            <Row icon={<Send className="size-[18px]" />} title="Запити під мої теги" hint="Для виконавців: з'явився запит, що вам підходить." checked={prefs.kinds.matching} onChange={(matching) => setPrefs({ kinds: { matching } })} />
            <Row icon={<Send className="size-[18px]" />} title="Мої пропозиції тегів" hint="Тег, який ви просили, додано до словника." checked={prefs.kinds.tags} onChange={(tags) => setPrefs({ kinds: { tags } })} />
            <Row icon={<Moon className="size-[18px]" />} title="Тихі години" hint="З 23:00 до 08:00 за Києвом сповіщення в Telegram приходять без звуку." checked={prefs.quietHours} onChange={(quietHours) => setPrefs({ quietHours })} />
          </div>
          <p className="pe-hint">Кількість нового видно й у заголовку вкладки: «(3) Findlyfy».</p>

          <h3 className="pe-label mt-2">Приватність</h3>
          <Row
            icon={<BarChart3 className="size-[18px]" />}
            title="Статистика використання"
            hint="Рахуємо дії без текстів, щоб покращувати сервіс. Без реклами й сторонніх сервісів."
            checked={consent === "granted"}
            onChange={(checked) => writeConsent(checked ? "granted" : "denied")}
          />
        </div>
      </div>
    </>
  );
}

/** Рядок Telegram: перемикач каналу, а під ним дія за станом підключення. */
function TelegramRow({ hint }: { hint: string }) {
  const prefs = usePrefs();
  const telegram = useTelegram();
  return (
    <div>
      <Row
        icon={<Send className="size-[18px]" />}
        title="Telegram"
        hint={hint}
        checked={prefs.channels.telegram && telegram.linked}
        disabled={!telegram.available || !telegram.linked}
        onChange={(telegramOn) => setPrefs({ channels: { telegram: telegramOn } })}
      />
      {telegram.available && (
        <div className="notif-actions">
          {telegram.linked ? (
            <button type="button" className="auth-link text-[12px]" onClick={() => void disconnectTelegram()}>
              Відключити
            </button>
          ) : telegram.waiting ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
                <Loader2 className="size-3.5 animate-spin" />
                Чекаємо підтвердження
              </span>
              <button type="button" className="auth-link text-[12px]" onClick={cancelTelegramLink}>
                Скасувати
              </button>
            </>
          ) : (
            <button type="button" className="auth-secondary px-4" style={{ minHeight: 36, fontSize: 13 }} onClick={() => void startTelegramLink()}>
              {telegram.blocked ? "Підключити ще раз" : "Підключити"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
