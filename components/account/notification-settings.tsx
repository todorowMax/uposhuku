"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, Send, X } from "lucide-react";
import { sessionStore } from "@/lib/auth/client";
import { enablePush, pushState, setPrefs, usePrefs, type PushState } from "@/lib/notifications";
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
  const [push, setPush] = useState<PushState>("default");

  useEffect(() => {
    if (open) setPush(pushState());
  }, [open]);

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

  return (
    <>
      <div aria-hidden className="auth-scrim place-scrim" onClick={close} />
      <div className="place-wrap">
        <div role="dialog" aria-modal="true" aria-label="Сповіщення" className="place-panel glass-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-ink">Сповіщення</h2>
            <button type="button" onClick={close} aria-label="Закрити" className="auth-icon-button -mr-1.5">
              <X className="size-4" strokeWidth={2} />
            </button>
          </div>
          <p className="auth-lead">Про що повідомляти: нові пропозиції на ваш запит, нові запити під ваші теги, повідомлення в чаті й угоди, що чекають на вас.</p>
          <div className="grid gap-1">
            <Row
              icon={<Mail className="size-[18px]" strokeWidth={1.9} />}
              title="Пошта"
              hint={`Листи на ${session.user.email}. Надсилання підключимо разом із сервером.`}
              checked={prefs.email}
              onChange={(email) => setPrefs({ email })}
            />
            <Row
              icon={<Bell className="size-[18px]" strokeWidth={1.9} />}
              title="Сповіщення в браузері"
              hint={pushHint}
              checked={prefs.push && push === "granted"}
              disabled={push === "unsupported" || push === "denied"}
              onChange={(checked) => {
                if (!checked) {
                  setPrefs({ push: false });
                  return;
                }
                void enablePush().then(setPush);
              }}
            />
            <Row
              icon={<Send className="size-[18px]" strokeWidth={1.9} />}
              title="Telegram"
              hint="Особистий бот напише, коли відгукнулись на запит. Скоро."
              checked={false}
              disabled
              onChange={() => {}}
            />
          </div>
          <p className="pe-hint">Кількість нового видно й у заголовку вкладки: «(3) Vibe Map».</p>
        </div>
      </div>
    </>
  );
}
