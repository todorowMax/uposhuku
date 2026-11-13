"use client";

// components/account/notification-settings.tsx
//
// Куди писати, коли зʼявилась пропозиція, повідомлення чи угода. Браузер показує сповіщення, поки вкладка відкрита;
// пошта й Telegram пишуть із сервера, коли людини немає на сайті (lib/server/notify.ts). Три розділи й одинадцять
// перемикачів не вміщаються в шторку, тому це екран (DESIGN.md, «Шари»); перемикачі діють одразу, низу немає.
// Стан і підписи в `use-notification-settings.ts`.

import { Bell, Mail, Send } from "@/components/icons";
import { BarChart3, Moon } from "lucide-react";
import { NotificationRow } from "@/components/account/parts/notification-row";
import { TelegramRow } from "@/components/account/parts/telegram-row";
import { useNotificationSettings } from "@/components/account/use-notification-settings";
import { Screen } from "@/components/ui/screen";
import { writeConsent } from "@/kit/telemetry/client";
import { sessionStore } from "@/lib/auth/client";
import { enablePush, setPrefs } from "@/lib/notifications";
import { createStore, useStore } from "@/lib/store";

export const notificationSettingsStore = createStore(false);

const close = () => notificationSettingsStore.set(false);

/** Вміст екрана: монтується лише коли екран відкрито, тому стан браузера читається свіжим. */
const NotificationSettingsBody = () => {
  const settings = useNotificationSettings();
  const { prefs, push, consent } = settings;
  return (
      <div className="grid gap-3">
        <p className="pe-hint">Куди писати, коли з&apos;явилась пропозиція, повідомлення чи угода, і про що саме.</p>

        <h3 className="pe-label">Де</h3>
        <div className="grid gap-1">
          <NotificationRow
            icon={<Bell className="size-4.5" />}
            title="Сповіщення в браузері"
            hint={settings.pushHint}
            checked={prefs.channels.push && push === "granted"}
            disabled={push === "unsupported" || push === "denied"}
            onChange={(checked) => {
              if (!checked) {
                setPrefs({ channels: { push: false } });
                return;
              }
              void enablePush().then(settings.setPush);
            }}
          />
          <NotificationRow icon={<Mail className="size-4.5" />} title="Пошта" hint="Листи про нові відгуки й повідомлення, якщо ви не в сервісі." checked={prefs.channels.email} onChange={(email) => setPrefs({ channels: { email } })} />
          <TelegramRow hint={settings.telegramHint} />
        </div>

        <h3 className="pe-label mt-2">Про що</h3>
        <div className="grid gap-1">
          <NotificationRow icon={<Send className="size-4.5" />} title="Нові пропозиції на мій запит" hint="Виконавець відгукнувся на вашу задачу." checked={prefs.kinds.offers} onChange={(offers) => setPrefs({ kinds: { offers } })} />
          <NotificationRow icon={<Send className="size-4.5" />} title="Повідомлення в чаті" hint="Вам відповіли чи написали першими." checked={prefs.kinds.messages} onChange={(messages) => setPrefs({ kinds: { messages } })} />
          <NotificationRow icon={<Send className="size-4.5" />} title="Угоди" hint="Прийняли, оплатили, здали етап." checked={prefs.kinds.deals} onChange={(deals) => setPrefs({ kinds: { deals } })} />
          <NotificationRow icon={<Send className="size-4.5" />} title="Запити під мої теги" hint="Для виконавців: з'явився запит, що вам підходить." checked={prefs.kinds.matching} onChange={(matching) => setPrefs({ kinds: { matching } })} />
          <NotificationRow icon={<Send className="size-4.5" />} title="Мої пропозиції тегів" hint="Тег, який ви просили, додано до словника." checked={prefs.kinds.tags} onChange={(tags) => setPrefs({ kinds: { tags } })} />
          <NotificationRow icon={<Moon className="size-4.5" />} title="Тихі години" hint="З 23:00 до 08:00 за Києвом сповіщення в Telegram приходять без звуку." checked={prefs.quietHours} onChange={(quietHours) => setPrefs({ quietHours })} />
        </div>
        <p className="pe-hint">Кількість нового видно й у заголовку вкладки: «(3) Findlyfy».</p>

        <h3 className="pe-label mt-2">Приватність</h3>
        <NotificationRow
          icon={<BarChart3 className="size-4.5" />}
          title="Статистика використання"
          hint="Рахуємо дії без текстів, щоб покращувати сервіс. Без реклами й сторонніх сервісів."
          checked={consent === "granted"}
          onChange={(checked) => writeConsent(checked ? "granted" : "denied")}
        />
      </div>
  );
};

export const NotificationSettings = () => {
  const open = useStore(notificationSettingsStore);
  const session = useStore(sessionStore);
  return (
    <Screen open={open && session.status === "user"} onOpenChange={(next) => !next && close()} title="Сповіщення" description="Куди писати, коли зʼявилась пропозиція, повідомлення чи угода, і про що саме." desktop="dialog">
      <NotificationSettingsBody />
    </Screen>
  );
};
