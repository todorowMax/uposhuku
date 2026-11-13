"use client";

// Рядок налаштувань сповіщень: значок, назва з поясненням і перемикач. Клік по тексту перемикає так само, як по самому перемикачу.

import { useId } from "react";
import { Switch } from "@/components/ui/switch";

export namespace NotificationRowTypes {
  export type Props = {
    icon: React.ReactNode;
    title: string;
    hint: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
  };
}

export const NotificationRow = ({ icon, title, hint, checked, disabled, onChange }: NotificationRowTypes.Props) => {
  const id = useId();
  return (
    <div className="notif-row" data-disabled={disabled || undefined}>
      <span className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 text-ink-muted">{icon}</span>
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="block text-sm font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-xs font-normal leading-snug text-ink-muted">{hint}</span>
        </label>
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
};
