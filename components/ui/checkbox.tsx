"use client";

// shadcn/ui Checkbox (Radix) під наш дизайн: рамка в токенах, вибраний стан заливкою бренду, видимий фокус.
// `CheckboxField` ставить поруч видимий підпис, клік по всьому рядку. Стилі: .ui-checkbox-* у globals.css.

import type * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "@/components/icons";
import { cn } from "@/lib/utils";

const Checkbox = ({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) => (
  <CheckboxPrimitive.Root data-slot="checkbox" className={cn("ui-checkbox", className)} {...props}>
    <CheckboxPrimitive.Indicator className="ui-checkbox-mark">
      <Check className="size-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);

export namespace CheckboxFieldTypes {
  export type Props = Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "children"> & { id: string; label: React.ReactNode };
}

const CheckboxField = ({ id, label, className, ...props }: CheckboxFieldTypes.Props) => (
  <label htmlFor={id} className={cn("ui-checkbox-field", className)}>
    <Checkbox id={id} {...props} />
    <span>{label}</span>
  </label>
);

export { Checkbox, CheckboxField };
