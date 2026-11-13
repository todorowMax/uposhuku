"use client";

// components/legal/terms-update-sheet.tsx
//
// Шторка «Ми оновили умови» над картою. Не блокує карту, чат і читання: її можна закрити. Поки умови не прийняті,
// сервер не пускає угоди, оплату й відгуки. Посилання відкриваються в новій вкладці, шторка при цьому лишається.

import { useTermsUpdate } from "@/components/legal/use-terms-update";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { LegalDoc } from "@/lib/legal/acceptance";

const DOC_LINKS: Partial<Record<LegalDoc, { href: string; label: string }>> = {
  terms: { href: "/legal/terms", label: "Умови користування" },
  privacy: { href: "/legal/privacy", label: "Політика конфіденційності" },
};

export const TermsUpdateSheet = () => {
  const update = useTermsUpdate();
  return (
    <Sheet open={update.open} onOpenChange={(open) => !open && update.later()}>
      <SheetContent>
        <SheetTitle className="ui-sheet-title">Ми оновили умови</SheetTitle>
        <SheetBody className="grid gap-3 text-sm">
          <SheetDescription className="text-ink-muted">
            Прочитайте оновлені документи й підтвердьте, що приймаєте їх. Поки цього не зроблено, угоди, оплата й відгуки недоступні. Карта, чат і перегляд працюють як завжди.
          </SheetDescription>
          <ul className="grid gap-1.5">
            {update.pending.map((item) => {
              const link = DOC_LINKS[item.doc];
              return link ? (
                <li key={item.doc}>
                  <a href={link.href} target="_blank" rel="noreferrer" className="auth-link">
                    {link.label}
                  </a>
                </li>
              ) : null;
            })}
          </ul>
          {update.error && (
            <p role="alert" className="auth-error">
              {update.error}
            </p>
          )}
          <div className="grid gap-2">
            <Button disabled={update.busy} onClick={() => void update.accept()}>
              Приймаю
            </Button>
            <Button variant="quiet" onClick={update.later}>
              Пізніше
            </Button>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
