"use client";

// components/admin/escrow-resolve-form.tsx
//
// Спір ескроу в адмінці: адреса контракту етапу, вибір відсотка виконавцю (кратно 5) і готова транзакція resolve для
// мультипідпису (Safe). Сервер ключів не тримає й нічого не підписує; після виконання транзакції в мережі статус
// етапу піднімає звірка з контрактом. Другий фактор тут не потрібен: підпис у Safe його заміняє.

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { DECISION_COMMENT_MAX } from "@/lib/admin/types";
import { CopyRow } from "@/components/deals/copy-row";
import { useEscrowResolve } from "./use-escrow-resolve";

export namespace EscrowResolveFormTypes {
  export interface Props {
    dealId: string;
    stageId: string;
    stageTitle: string;
    amount: number;
    /** Адреса клона етапу; null, поки сверка її не записала. */
    contract: string | null;
  }
}

export const EscrowResolveForm = ({ dealId, stageId, stageTitle, amount, contract }: EscrowResolveFormTypes.Props) => {
  const form = useEscrowResolve({ dealId, stageId });
  const fieldId = `escrow-resolve-${stageId}`;
  if (!contract) return <p className="adm-muted">Адреса контракту етапу «{stageTitle}» ще невідома: дочекайтеся звірки з контрактом (вона йде кожні кілька хвилин) і оновіть сторінку.</p>;
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.prepare();
      }}
    >
      <p className="adm-muted">
        Етап «{stageTitle}», {amount} USDT у ескроу-контракті. Рішення ухвалює арбітр у блокчейні: підготуйте транзакцію й підпишіть її в мультипідписі. Сервер нічого не підписує.
      </p>
      <dl className="grid gap-2 text-sm">
        <CopyRow label="Контракт етапу" value={contract} copied={form.copied === "Контракт етапу"} onCopy={() => void form.copy("Контракт етапу", contract)} />
      </dl>
      <Field label="Відсоток виконавцю" htmlFor={`${fieldId}-percent`} hint="Від 0 до 100, кратно 5: решта повертається замовнику. 100: усе виконавцю, 0: усе замовнику." error={form.percentValid ? null : "Вкажіть число від 0 до 100, кратне 5."}>
        <Input id={`${fieldId}-percent`} inputMode="numeric" value={form.percent} onChange={(event) => form.setPercent(event.target.value)} aria-invalid={form.percentValid ? undefined : true} className="tabular-nums" />
      </Field>
      <Field label="Коментар для журналу" htmlFor={`${fieldId}-comment`} hint="Лишається в журналі рішень." error={form.commentError}>
        <Textarea id={`${fieldId}-comment`} rows={4} value={form.comment} maxLength={DECISION_COMMENT_MAX} onChange={(event) => form.setComment(event.target.value)} aria-invalid={form.commentError ? true : undefined} />
      </Field>
      {form.error && (
        <p role="alert" className="auth-error">
          {form.error}
        </p>
      )}
      <Button type="submit" disabled={!form.ready || form.busy} className="w-auto">
        {form.busy ? "Готуємо…" : "Підготувати транзакцію"}
      </Button>
      {form.prepared && (
        <div className="grid gap-2" role="status">
          <p className="text-sm font-semibold text-ink">Дані для мультипідпису (Safe, «нова транзакція»)</p>
          <dl className="grid gap-2 text-sm">
            <CopyRow label="Кому (to)" value={form.prepared.to} copied={form.copied === "to"} onCopy={() => void form.copy("to", form.prepared?.to ?? "")} />
            <CopyRow label="Мережа (chainId)" value={String(form.prepared.chainId)} copied={form.copied === "chain"} onCopy={() => void form.copy("chain", String(form.prepared?.chainId))} />
            <CopyRow label="Сума (value)" value={form.prepared.value} copied={form.copied === "value"} onCopy={() => void form.copy("value", "0")} />
            <CopyRow label="Calldata" value={form.prepared.data} copied={form.copied === "data"} onCopy={() => void form.copy("data", form.prepared?.data ?? "")} />
          </dl>
          <p className="adm-muted">Після виконання транзакції статус етапу оновиться за станом контракту.</p>
        </div>
      )}
    </form>
  );
};
