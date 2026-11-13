"use client";

// components/legal/risk-sheet.tsx
//
// Ризики оплати в USDT: одне вікно на всі входи (хеш USDT, оплата з гаманця, ескроу, реквізити USDT, підтвердження
// гаманця). Відкривається з lib/legal/client.ts (`askRiskAck`), стоїть у розкладці карти. Це читання списку з
// 10 пунктів, який не вміщається в 85% висоти телефона, тож за DESIGN.md («Шари») це екран, а не шторка:
// шапка «←», одна прокручувана середина, закріплений низ із «Продовжити». Назва файлу лишена за брифом.
// «←», Escape й системне «назад» закривають вікно без прийняття: тоді дія не виконується.

import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Screen } from "@/components/ui/screen";
import { useRiskSheet } from "@/components/legal/use-risk-sheet";
import { RISK_ITEMS } from "@/lib/legal/risk-items";

export const RiskSheet = () => {
  const sheet = useRiskSheet();
  return (
    <Screen
      open={sheet.open}
      onOpenChange={(open) => !open && sheet.dismiss()}
      title="Ризики оплати в USDT"
      description="Прочитайте ризики й підтвердьте, що розумієте їх."
      desktop="dialog"
      footer={
        <Button className="w-full" disabled={!sheet.checked || sheet.busy} onClick={() => void sheet.accept()}>
          Продовжити
        </Button>
      }
    >
      <div className="grid gap-3 text-sm">
        <p className="text-ink-muted">Прочитайте перед першою дією з USDT. Підтвердження діє для всіх угод, доки текст не зміниться.</p>
        <ol className="grid gap-2 pl-5 list-decimal">
          {RISK_ITEMS.map((item) => (
            <li key={item.title} className="pl-1">
              <strong className="font-semibold text-ink">{item.title}.</strong> {item.text}
            </li>
          ))}
        </ol>
        <CheckboxField id="risk-ack" checked={sheet.checked} onCheckedChange={(value) => sheet.setChecked(value === true)} label="Я зрозумів(ла) ризики" />
        {sheet.error && (
          <p role="alert" className="auth-error">
            {sheet.error}
          </p>
        )}
      </div>
    </Screen>
  );
};
