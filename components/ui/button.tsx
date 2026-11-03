// Кнопка дизайн-системи. Варіанти поки повторюють наявні класи .auth-primary, .auth-secondary
// і .offer-primary (стилі в globals.css, разом з усіма станами); нові кнопки беруть цей компонент, а не клас
// руками. Решта нативних кнопок переїжджає сюди, коли файл чіпають (UX-ревʼю 03.11, C-16).

import type * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "auth-primary",
  secondary: "auth-secondary",
  offer: "offer-primary",
} as const;

export namespace ButtonTypes {
  export type Variant = keyof typeof VARIANTS;
  export type Props = React.ComponentProps<"button"> & { variant?: Variant };
}

const Button = ({ className, variant = "primary", type = "button", ...props }: ButtonTypes.Props) => (
  <button type={type} data-slot="button" className={cn(VARIANTS[variant], className)} {...props} />
);

export { Button };
