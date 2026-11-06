"use client";

// components/requisites/method-card.tsx
//
// Картка одного способу оплати в кабінеті: перемикач, а поля розкриваються лише коли спосіб увімкнено.

import type { ReactNode } from "react";
import { SwitchField } from "@/components/ui/switch";

export namespace MethodCardTypes {
  export type Props = { id: string; title: string; hint?: string; on: boolean; onChange: (on: boolean) => void; children: ReactNode };
}

export const MethodCard = ({ id, title, hint, on, onChange, children }: MethodCardTypes.Props) => (
  <div className="deal-box grid gap-3">
    <SwitchField id={id} label={title} hint={hint} checked={on} onCheckedChange={onChange} />
    {on && <div className="grid gap-3">{children}</div>}
  </div>
);
