"use client";

// shadcn/ui Input і Textarea, закастомлені під наш дизайн: ті самі висота, радіус, рамка й
// фокус, що в .auth-input (його ж використовує Select). Нові форми беруть ці компоненти,
// а не пишуть клас руками; стилі лишаються в одному місці, globals.css.

import * as React from "react";
import { cn } from "@/lib/utils";

function Input({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn("auth-input w-full", className)}
      {...props}
    />
  );
}

function Textarea({
  className,
  rows = 3,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      data-slot="textarea"
      className={cn("auth-input auth-textarea w-full resize-none", className)}
      {...props}
    />
  );
}

/** Підпис, поле, підказка й помилка разом: однакові відступи в усіх формах. */
function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-slot="field" className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="pe-label">
        {label}
        {optional && (
          <span className="font-normal text-ink-muted"> (необов'язково)</span>
        )}
      </label>
      {children}
      {hint && !error && <p className="pe-hint mt-1.5">{hint}</p>}
      {error && (
        <p role="alert" className="auth-error mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

export { Field, Input, Textarea };
