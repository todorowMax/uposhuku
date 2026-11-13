"use client";

// components/account/export-data-screen.tsx
//
// «Завантажити мої дані» (меню акаунта). Одна дія, але з поясненням, що в файлі, тож екран, а не підказка (DESIGN.md, «Шари»).
// Виписку будує GET /api/account/export (lib/server/account-export.ts).

import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { useExportData } from "@/components/account/use-export-data";

const CONTENT = ["акаунт і спосіб входу", "профіль, роботи й теги", "ваші запити й відгуки на чужі запити", "ваші повідомлення", "угоди з вашого боку й відгуки", "реквізити та згоди з документами", "налаштування сповіщень і Telegram"];

export const ExportDataScreen = () => {
  const exporter = useExportData();
  return (
    <Screen
      open={exporter.open}
      onOpenChange={exporter.onOpenChange}
      title="Мої дані"
      description="Завантажити файл з усім, що ми про вас знаємо."
      desktop="dialog"
      footer={
        <Button className="w-full" disabled={exporter.busy} onClick={() => void exporter.download()}>
          {exporter.busy ? "Готуємо файл" : "Завантажити файл"}
        </Button>
      }
    >
      <div className="grid gap-3 text-sm">
        <p>Один файл JSON з тим, що ми зберігаємо про вас:</p>
        <ul className="grid list-disc gap-1 pl-5">
          {CONTENT.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-ink-muted">Чужі імена й пошти в ньому замінені міткою. Токенів входу й кодів у файлі немає. Файл можна завантажити не частіше трьох разів на годину.</p>
        <div role="status" aria-live="polite">
          {exporter.note && <p className={exporter.note.tone === "error" ? "auth-error" : "text-ink-muted"}>{exporter.note.text}</p>}
        </div>
      </div>
    </Screen>
  );
};
