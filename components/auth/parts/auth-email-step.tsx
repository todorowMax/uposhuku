"use client";

// Перший крок входу: пошта (одне поле), Google, галочка згоди з умовами.

import { Loader2 } from "@/components/icons";
import { GoogleButton } from "@/components/auth/google-button";
import { TERMS_CHECKBOX_ID } from "@/components/auth/use-terms-consent";
import type { AuthPanelState } from "@/components/auth/use-auth-panel";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { authFlowStore } from "@/lib/auth/client";

export namespace AuthEmailStepTypes {
  export type Props = Pick<AuthPanelState, "mode" | "email" | "busy" | "error" | "terms" | "googleHref" | "sendCode" | "changeEmail" | "beforeGoogle">;
}

const lead = (mode: AuthPanelState["mode"]) => {
  if (mode === "publish") return "Підтвердіть пошту або увійдіть через Google, і ми почнемо шукати виконавця для вашого проєкту.";
  if (mode === "performer") return "Створіть профіль, і замовники знайдуть вас на карті. Пошта й код з листа, без пароля.";
  return "Пошта й код з листа, без пароля. Нова адреса створює новий акаунт.";
};

export const AuthEmailStep = ({ mode, email, busy, error, terms, googleHref, sendCode, changeEmail, beforeGoogle }: AuthEmailStepTypes.Props) => (
  <>
    <p className="auth-lead">{lead(mode)}</p>
    <form onSubmit={sendCode} className="grid gap-2.5">
      <label htmlFor="auth-email" className="sr-only">
        Пошта
      </label>
      <Input
        id="auth-email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="Електронна пошта"
        value={email}
        onChange={(event) => changeEmail(event.target.value)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? "auth-error" : undefined}
      />
      {error && (
        <p id="auth-error" role="alert" className="auth-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !email.includes("@")}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Увійти або зареєструватися
      </Button>
    </form>
    <div className="auth-divider">
      <span>або</span>
    </div>
    <GoogleButton href={googleHref} onClick={beforeGoogle} />
    <div className="grid gap-1.5">
      <CheckboxField
        id={TERMS_CHECKBOX_ID}
        checked={terms.agreed}
        onCheckedChange={(value) => terms.change(value === true)}
        aria-invalid={Boolean(terms.error) || undefined}
        aria-describedby={terms.error ? "auth-terms-error" : undefined}
        label={
          <>
            Мені є 18 років, я приймаю{" "}
            <a href="/legal/terms" target="_blank" rel="noreferrer" className="auth-link">
              умови
            </a>{" "}
            та{" "}
            <a href="/legal/privacy" target="_blank" rel="noreferrer" className="auth-link">
              політику конфіденційності
            </a>
          </>
        }
      />
      {terms.error && (
        <p id="auth-terms-error" role="alert" className="auth-error">
          {terms.error}
        </p>
      )}
    </div>
    {mode === "login" && (
      <p className="text-center text-xs text-ink-muted">
        Хочете, щоб вас знайшли замовники?{" "}
        <Button variant="link" className="text-xs" onClick={() => authFlowStore.set({ mode: "performer" })}>
          Я виконавець
        </Button>
      </p>
    )}
  </>
);
