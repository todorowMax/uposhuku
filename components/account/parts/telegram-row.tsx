"use client";

// Рядок Telegram: перемикач каналу, а під ним дія за станом підключення.

import { Loader2, Send } from "@/components/icons";
import { NotificationRow } from "@/components/account/parts/notification-row";
import { Button } from "@/components/ui/button";
import { setPrefs, usePrefs } from "@/lib/notifications";
import { cancelTelegramLink, disconnectTelegram, startTelegramLink, useTelegram } from "@/lib/telegram/link-client";

export namespace TelegramRowTypes {
  export type Props = { hint: string };
}

export const TelegramRow = ({ hint }: TelegramRowTypes.Props) => {
  const prefs = usePrefs();
  const telegram = useTelegram();
  return (
    <div>
      <NotificationRow
        icon={<Send className="size-4.5" />}
        title="Telegram"
        hint={hint}
        checked={prefs.channels.telegram && telegram.linked}
        disabled={!telegram.available || !telegram.linked}
        onChange={(telegramOn) => setPrefs({ channels: { telegram: telegramOn } })}
      />
      {telegram.available && (
        <div className="notif-actions">
          {telegram.linked ? (
            <Button variant="link" className="text-xs" onClick={() => void disconnectTelegram()}>
              Відключити
            </Button>
          ) : telegram.waiting ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <Loader2 className="size-3.5 animate-spin" />
                Чекаємо підтвердження
              </span>
              <Button variant="link" className="text-xs" onClick={cancelTelegramLink}>
                Скасувати
              </Button>
            </>
          ) : (
            <Button variant="secondary" className="min-h-9 px-4 text-sm" onClick={() => void startTelegramLink()}>
              {telegram.blocked ? "Підключити ще раз" : "Підключити"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
