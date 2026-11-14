"use client";

// components/phone/phone-verify-sheet.tsx
//
// Шторка «Підтвердіть телефон»: одна на всі входи (публікація запиту, пропозиція й прийняття угоди замовником, пункт меню).
// Це швидка дія з однією кнопкою, тож за DESIGN.md («Шари») шторка: від 768 px маленьке вікно по центру. Відкривається з
// lib/phone/client.ts (`askPhone`), стоїть у розкладці карти. Для вже підтвердженого номера показує маску.

import { Loader2 } from "@/components/icons";
import { usePhoneVerifySheet } from "@/components/phone/use-phone-verify-sheet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CONTACT_EMAIL } from "@/lib/legal/config";

export const PhoneVerifySheet = () => {
  const sheet = usePhoneVerifySheet();
  const verified = sheet.state === "verified";
  return (
    <Sheet open={sheet.open} onOpenChange={(open) => !open && sheet.dismiss()}>
      <SheetContent>
        <SheetTitle className="ui-sheet-title">{verified ? "Телефон підтверджено" : "Підтвердіть телефон"}</SheetTitle>
        <SheetBody className="grid gap-3 text-sm">
          <SheetDescription className="text-ink-muted">
            {verified
              ? "Щоб змінити номер, напишіть нам."
              : "Щоб публікувати запити й домовлятися про угоди, підтвердіть номер через наш Telegram-бот. Номер ми не зберігаємо: лише захищений відбиток, щоб один номер був в одного акаунта."}
          </SheetDescription>
          {verified && sheet.mask && <p className="font-semibold text-ink">{sheet.mask}</p>}
          <div role="status" className="text-ink-muted">
            {sheet.state === "waiting" && (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Чекаємо на підтвердження в боті…
              </div>
            )}
            {sheet.justVerified && <p className="font-semibold text-ink">Номер підтверджено</p>}
          </div>
          {sheet.error && (
            <p role="alert" className="auth-error">
              {sheet.error}
            </p>
          )}
          {!verified && (
            <div className="grid gap-2">
              <Button disabled={sheet.state === "starting"} onClick={() => void sheet.start()}>
                Відкрити Telegram
              </Button>
              {sheet.state === "waiting" && sheet.link && (
                <a href={sheet.link} target="_blank" rel="noreferrer" className="auth-link">
                  Не відкрилося? Відкрити ще раз
                </a>
              )}
            </div>
          )}
          {!verified && (
            <p className="text-ink-muted">
              Немає Telegram? Напишіть нам:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="auth-link">
                {CONTACT_EMAIL}
              </a>
            </p>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
