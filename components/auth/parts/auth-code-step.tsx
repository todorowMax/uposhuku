"use client";

// Другий крок входу: код (одне поле з клітинок) і повторний лист. Шість цифр перевіряються самі, окремої кнопки немає.

import { CodeInput } from "@/components/auth/code-input";
import type { AuthPanelState } from "@/components/auth/use-auth-panel";
import { Button } from "@/components/ui/button";

export namespace AuthCodeStepTypes {
  export type Props = Pick<AuthPanelState, "email" | "mock" | "hint" | "digits" | "busy" | "error" | "cooldown" | "captcha" | "codeRef" | "onDigits" | "sendCode">;
}

export const AuthCodeStep = ({ email, mock, hint, digits, busy, error, cooldown, captcha, codeRef, onDigits, sendCode }: AuthCodeStepTypes.Props) => (
  <>
    {mock ? (
      <p className="auth-lead">
        Тестовий вхід для <strong className="font-semibold text-ink">{email}</strong>. Введіть код доступу, який вам дали.
      </p>
    ) : (
      <p className="auth-lead">
        Надіслали {digits.length} цифр на <strong className="font-semibold text-ink">{email}</strong>. Код діє 10 хвилин.
      </p>
    )}
    {mock && hint && (
      <p className="auth-mock">
        Тестовий режим: листи поки не надсилаються. Введіть код <strong>{hint}</strong>.
      </p>
    )}
    <CodeInput ref={codeRef} digits={digits} onChange={onDigits} disabled={busy} invalid={Boolean(error)} />
    <p role="alert" className="auth-error min-h-5 text-center">
      {error ?? (busy ? "Перевіряємо…" : "")}
    </p>
    <div className="flex items-center justify-center gap-1 text-sm text-ink-muted">
      Не прийшов лист?
      <Button variant="link" disabled={cooldown > 0 || busy || captcha.pending} onClick={() => void sendCode()}>
        {cooldown > 0 ? `Надіслати ще раз за ${cooldown} с` : "Надіслати ще раз"}
      </Button>
    </div>
  </>
);
