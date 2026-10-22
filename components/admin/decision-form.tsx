"use client";

// Рішення модератора у спорі: вибір, обов'язковий коментар і підтвердження. Гроші цей крок не
// рухає (оплата ще не підключена): змінюється стан угоди, а сторони отримують рядок у розмові.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { DECISION_COMMENT_MAX, DECISION_COMMENT_MIN, DECISION_LABEL } from "@/lib/admin/types";
import { formatMoney } from "@/lib/admin/format";
import type { DealMethod, ModeratorAction } from "@/lib/deals/types";

const HINT: Record<ModeratorAction, string> = {
  release: "Робота прийнята: етап виплачується виконавцю, угода йде далі або завершується.",
  refund: "Кошти повертаються замовнику, угоду закрито.",
  rework: "Етап повертається виконавцю, щоб виправити й здати знову. Холд лишається той самий.",
};

const CONSEQUENCE: Record<ModeratorAction, string> = {
  release: "Етап буде позначено виплаченим.",
  refund: "Етап буде позначено поверненим, а угоду закрито.",
  rework: "Етап повернеться виконавцю на доопрацювання.",
};

export function DecisionForm({ dealId, stageId, stageTitle, amount, method, holdLate, reworkable }: { dealId: string; stageId: string; stageTitle: string; amount: number; method: DealMethod; holdLate: boolean; reworkable: boolean }) {
  const router = useRouter();
  const id = useId();
  const [action, setAction] = useState<ModeratorAction | "">("");
  const [comment, setComment] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = comment.trim().length;
  const commentError = length > 0 && length < DECISION_COMMENT_MIN ? `Поясніть рішення: хоча б ${DECISION_COMMENT_MIN} символів.` : null;
  const ready = action !== "" && length >= DECISION_COMMENT_MIN && length <= DECISION_COMMENT_MAX;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/disputes/${dealId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, comment, stageId }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
        setError(problem?.detail ?? "Не вдалося застосувати рішення. Спробуйте ще раз.");
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Немає зв'язку з сервером. Спробуйте ще раз.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) setConfirming(true);
      }}
    >
      <p className="adm-muted">
        Етап «{stageTitle}», {formatMoney(amount)}. {method === "safe" ? "Кошти заморожено в банку." : "Прямий переказ."} Гроші цим рішенням не рухаються: воно змінює стан угоди, виплату чи повернення виконує банк окремо.
      </p>
      {holdLate && <p className="deal-note deal-note-warn">Холд збіг: банк міг сам повернути кошти. Перш ніж виплачувати, перевірте стан у кабінеті банку.</p>}
      <RadioGroup value={action} onValueChange={(value) => setAction(value as ModeratorAction)} aria-label="Рішення у спорі">
        {(["release", "refund", "rework"] as const).map((item) => (
          <RadioCard key={item} id={`${id}-${item}`} value={item} title={DECISION_LABEL[item]} hint={item === "rework" && !reworkable ? "Недоступно: холд збіг." : HINT[item]} />
        ))}
      </RadioGroup>
      <Field label="Коментар для сторін" htmlFor={`${id}-comment`} hint="Його побачать обидві сторони в розмові, а ми збережемо в журналі." error={commentError}>
        <Textarea id={`${id}-comment`} rows={4} value={comment} maxLength={DECISION_COMMENT_MAX} onChange={(event) => setComment(event.target.value)} placeholder="Що ви побачили в розмові й чому вирішили саме так" aria-invalid={commentError ? true : undefined} />
      </Field>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <button type="submit" className="auth-primary px-5" disabled={!ready || busy || (action === "rework" && !reworkable)}>
        Застосувати рішення
      </button>
      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogTitle>{action ? DECISION_LABEL[action] : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            {action ? CONSEQUENCE[action] : ""} Обидві сторони побачать ваш коментар у розмові. Скасувати рішення не можна.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Назад</AlertDialogCancel>
            <button type="button" className="auth-primary px-4" disabled={busy} onClick={() => void submit()}>
              {busy ? "Застосовуємо…" : "Так, застосувати"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
