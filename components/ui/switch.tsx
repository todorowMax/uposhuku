"use client";

// shadcn/ui Switch (Radix) під наш дизайн: доріжка й бігунок у токенах, увімкнений стан заливкою бренду,
// видимий фокус, вимкнений стан напівпрозорий. `SwitchField` ставить поруч видимий підпис. Стилі: .ui-switch-* у globals.css.

import type * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Switch = ({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root data-slot="switch" className={cn("ui-switch", className)} {...props}>
    <SwitchPrimitive.Thumb className="ui-switch-thumb" />
  </SwitchPrimitive.Root>
);

export namespace SwitchFieldTypes {
  export type Props = Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "children"> & { id: string; label: React.ReactNode; hint?: React.ReactNode };
}

const SwitchField = ({ id, label, hint, className, ...props }: SwitchFieldTypes.Props) => (
  <div className={cn("ui-switch-field", className)}>
    <label htmlFor={id} className="ui-switch-label">
      <span className="font-semibold">{label}</span>
      {hint && <span className="ui-switch-hint">{hint}</span>}
    </label>
    <Switch id={id} {...props} />
  </div>
);

export { Switch, SwitchField };
