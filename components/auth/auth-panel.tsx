"use client";

// components/auth/auth-panel.tsx
//
// Вхід і публікація запиту в одній шторці (DESIGN.md, «Шари»): пошта, потім код, по одному полю, і галочка згоди.
// Паролів немає: пошта, 6 цифр з листа, готово; або Google. У режимі «publish» після входу одразу публікуємо
// чернетку: «одразу після коду запит публікується». Хто вже увійшов, код не вводить. Опублікований запит стає
// компактною панеллю на місці поля (components/requests/request-dock), тож окремого екрана «опубліковано» немає.
// Логіка в `use-auth-panel.ts`, кроки в `parts/`.

import { ArrowLeft, Loader2, MapPin, X } from "@/components/icons";
import { AuthCodeStep } from "@/components/auth/parts/auth-code-step";
import { AuthEmailStep } from "@/components/auth/parts/auth-email-step";
import { useAuthPanel } from "@/components/auth/use-auth-panel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { PublishedRequest } from "@/lib/requests/types";

export namespace AuthPanelScreenTypes {
  export type Props = { onPublished: (request: PublishedRequest) => void };
}

export const AuthPanel = ({ onPublished }: AuthPanelScreenTypes.Props) => {
  const { bodyRef, codeRef, ...auth } = useAuthPanel(onPublished);
  const { step } = auth;
  const publishing = step === "publishing";
  // Пока публікуємо, шторку не закрити: чернетка вже в дорозі.
  const hold = (event: Event) => publishing && event.preventDefault();
  return (
    <Sheet open onOpenChange={(next) => !next && auth.close()}>
      <SheetContent
        onEscapeKeyDown={hold}
        onPointerDownOutside={hold}
        onInteractOutside={hold}
        onOpenAutoFocus={(event) => {
          // Курсор у полі пошти, а не на кнопці «Закрити» (фокус у щойно відкритій шторці, SEM-7).
          event.preventDefault();
          document.getElementById("auth-email")?.focus();
        }}
      >
        <SheetDescription className="sr-only">Вхід у сервіс за поштою й кодом або через Google.</SheetDescription>
        <SheetBody className="auth-sheet grid gap-4">
          <div className="auth-dialog-header">
            {step === "code" && (
              <Button variant="icon" onClick={() => auth.setStep("email")} aria-label="Змінити пошту" className="auth-back">
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {!publishing && (
              <Button variant="icon" onClick={auth.close} aria-label="Закрити" className="auth-close">
                <X className="size-4" />
              </Button>
            )}
            <span className="auth-hero-icon" aria-hidden="true">
              <MapPin className="size-5" />
            </span>
            <SheetTitle className="auth-dialog-title">{auth.title}</SheetTitle>
          </div>

          <div ref={bodyRef} className="auth-sheet-step">
            {step === "email" && <AuthEmailStep {...auth} />}
            {step === "code" && <AuthCodeStep {...auth} codeRef={codeRef} />}
            {publishing && (
              <div className="grid justify-items-center gap-3 py-6 text-sm text-ink-muted">
                <Loader2 className="size-6 animate-spin text-brand" />
                Показуємо запит виконавцям…
              </div>
            )}
            {step === "failed" && (
              <>
                <p role="alert" className="auth-lead">
                  {auth.error}
                </p>
                <Button onClick={() => void auth.publish()}>Спробувати ще раз</Button>
              </>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
