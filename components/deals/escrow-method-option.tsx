"use client";

// components/deals/escrow-method-option.tsx
//
// Вибір «Ескроу (USDT)» у формах умов угоди: прапорець під способами оплати (примітив CheckboxField). Показується
// лише тому, кому функцію ввімкнено й для кого є фабрика: це вирішує сервер, тут лише показ. Знятий прапорець
// повертає звичайний спосіб оплати.

import { CheckboxField } from "@/components/ui/checkbox";

export const EscrowMethodOption = ({ id, selected, onChange }: { id: string; selected: boolean; onChange: (selected: boolean) => void }) => (
  <div className="grid gap-1">
    <CheckboxField id={id} checked={selected} onCheckedChange={(value) => onChange(value === true)} label="Платити через ескроу (USDT)" />
    <p className="deal-method-text">
      Замовник вносить USDT у контракт, виконавець здає роботу, замовник приймає. Платформа до грошей не має доступу: спір вирішує арбітр у блокчейні. Потрібен підтверджений гаманець виконавця; суми цілими USDT.
    </p>
  </div>
);
