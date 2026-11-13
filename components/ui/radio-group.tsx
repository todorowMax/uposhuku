"use client";

// shadcn/ui RadioGroup (Radix), закастомлений під наш дизайн: варіант — біла картка з
// кружком, вибраний підсвічується рамкою. Стилі: .ui-radio-* у globals.css.

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("ui-radio-group", className)} {...props} />;
}

/** Варіант з назвою й поясненням: клік по всій картці. Назва й пояснення можуть бути розміткою (значок, мітка). */
const RadioCard = ({ value, id, title, hint, disabled, className }: { value: string; id: string; title: React.ReactNode; hint?: React.ReactNode; disabled?: boolean; className?: string }) => (
  <label htmlFor={id} data-slot="radio-card" data-disabled={disabled || undefined} className={cn("ui-radio-card", className)}>
    <RadioGroupPrimitive.Item id={id} value={value} disabled={disabled} className="ui-radio-item">
      <RadioGroupPrimitive.Indicator className="ui-radio-dot" />
    </RadioGroupPrimitive.Item>
    <span className="grid gap-0.5">
      <span className="ui-radio-title">{title}</span>
      {hint && <span className="ui-radio-hint">{hint}</span>}
    </span>
  </label>
);

export namespace RadioTileTypes {
  export type Props = React.ComponentProps<"label"> & { value: string; id: string; disabled?: boolean };
}

/** Карта з власним виглядом: саме радіо схховане (дає клавіатуру, стрілки й стан), вигляд задають `className` і вміст. */
const RadioTile = ({ value, id, disabled, children, ...props }: RadioTileTypes.Props) => (
  <label htmlFor={id} data-slot="radio-tile" {...props}>
    <RadioGroupPrimitive.Item id={id} value={value} disabled={disabled} className="ui-radio-tile-input" />
    {children}
  </label>
);

export { RadioCard, RadioGroup, RadioTile };
