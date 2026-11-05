"use client";

// Форма одного прапорця: режим, пошти для режиму зі списком, код автентифікатора для грошових функцій.

import { useId } from "react";
import { Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import type { FeatureMode, FeatureName } from "@/lib/features/flags";
import { useFeatureForm } from "./use-feature-form";

const MODES: { value: FeatureMode; title: string; hint: string }[] = [
  { value: "off", title: "Вимкнено", hint: "Нікому." },
  { value: "allowlist", title: "За списком", hint: "Лише пошти зі списку." },
  { value: "on", title: "Усім", hint: "Для всіх користувачів." },
];

export const FeatureForm = ({ feature, mode, users, needsCode }: { feature: FeatureName; mode: FeatureMode; users: string; needsCode: boolean }) => {
  const id = useId();
  const form = useFeatureForm({ feature, mode, users, needsCode });
  return (
    <div className="mt-2 grid gap-3">
      <RadioGroup value={form.mode} onValueChange={(value) => form.setMode(value as FeatureMode)} aria-label={`Режим ${feature}`}>
        {MODES.map((item) => (
          <RadioCard key={item.value} id={`${id}-${item.value}`} value={item.value} title={item.title} hint={item.hint} />
        ))}
      </RadioGroup>
      {form.mode === "allowlist" && (
        <Field label="Пошти" htmlFor={`${id}-users`} hint="По одній у рядку або через кому.">
          <Textarea id={`${id}-users`} value={form.users} onChange={(event) => form.setUsers(event.target.value)} />
        </Field>
      )}
      {needsCode && (
        <Field label="Код автентифікатора" htmlFor={`${id}-totp`} hint="Функція рухає гроші: зміна потребує другого фактора.">
          <Input id={`${id}-totp`} inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={form.totp} className="tabular-nums" onChange={(event) => form.setTotp(event.target.value)} />
        </Field>
      )}
      {form.error && (
        <p role="alert" className="auth-error">
          {form.error}
        </p>
      )}
      {form.saved && (
        <p role="status" className="pe-notice">
          Збережено.
        </p>
      )}
      <Button disabled={!form.ready} onClick={() => void form.submit()} className="w-auto px-4">
        {form.busy && <Loader2 className="size-4 animate-spin" />}
        Зберегти
      </Button>
    </div>
  );
};
