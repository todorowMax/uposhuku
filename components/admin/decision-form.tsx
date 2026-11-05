"use client";

// Рішення модератора у спорі: вибір, обов'язковий коментар і підтвердження. У безпечній угоді рішення
// передається в банк: «виплачено» й «повернено» ставить його підтвердження. Часткова виплата необоротна.

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { DECISION_COMMENT_MAX, DECISION_COMMENT_MIN, DECISION_LABEL } from "@/lib/admin/types";
import { formatMoney } from "@/lib/admin/format";
import type { DealMethod, ModeratorAction } from "@/lib/deals/types";

const HINT: Record<ModeratorAction, string> = {
  release: "Робота прийнята: етап виплачується виконавцю, угода йде далі або завершується.",
  refund: "Кошти повертаються замовнику, угоду закрито.",
  partial: "Виконавцю виплачується відсоток його частки, кратний 5. Необоротно: банк не дає повернути виплачену частину.",
  rework: "Етап повертається виконавцю, щоб виправити й здати знову. Холд лишається той самий.",
};

const CONSEQUENCE: Record<ModeratorAction, string> = {
  release: "Етап буде позначено виплаченим.",
  refund: "Етап буде позначено поверненим, а угоду закрито.",
  partial: "Виплата часткова й необоротна: після неї виплачену частину повернути не можна.",
  rework: "Етап повернеться виконавцю на доопрацювання.",
};

export function DecisionForm({ dealId, stageId, stageTitle, amount, method, holdLate, reworkable }: { dealId: string; stageId: string; stageTitle: string; amount: number; method: DealMethod; holdLate: boolean; reworkable: boolean }) {
  const router = useRouter();
  const id = useId();
  const [action, setAction] = useState<ModeratorAction | "">("");
  const [comment, setComment] = useState("");
  const [percent, setPercent] = useState("50");
  const [totp, setTotp] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = comment.trim().length;
  const commentError = length > 0 && length < DECISION_COMMENT_MIN ? `Поясніть рішення: хоча б ${DECISION_COMMENT_MIN} символів.` : null;
  const percentNumber = Number(percent);
  const percentValid = Number.isInteger(percentNumber) && percentNumber >= 5 && percentNumber <= 95 && percentNumber % 5 === 0;
  // Рішення з грошима безпечної угоди підтверджуємо кодом автентифікатора; «на доопрацювання» грошей не рухає.
  const needsTotp = method === "safe" && action !== "" && action !== "rework";
  const totpValid = !needsTotp || /^\d{6}$/.test(totp);
  const ready = action !== "" && totpValid && length >= DECISION_COMMENT_MIN && length <= DECISION_COMMENT_MAX && (action !== "partial" || percentValid);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/disputes/${dealId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, comment, stageId, ...(needsTotp ? { totp } : {}), ...(action === "partial" ? { percent: percentNumber, confirm: true } : {}) }),
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
        Етап «{stageTitle}», {formatMoney(amount)}. {method === "safe" ? "Кошти заморожено в банку." : "Прямий переказ."} У безпечній угоді рішення передається в банк, а «виплачено» чи «повернено» з&apos;явиться після його підтвердження.
      </p>
      {holdLate && <p className="deal-note deal-note-warn">Холд збіг: банк міг сам повернути кошти. Перш ніж виплачувати, перевірте стан у кабінеті банку.</p>}
      <RadioGroup value={action} onValueChange={(value) => setAction(value as ModeratorAction)} aria-label="Рішення у спорі">
        {(method === "safe" ? (["release", "partial", "refund", "rework"] as const) : (["release", "refund", "rework"] as const)).map((item) => (
          <RadioCard key={item} id={`${id}-${item}`} value={item} title={DECISION_LABEL[item]} hint={item === "rework" && !reworkable ? "Недоступно: холд збіг." : HINT[item]} />
        ))}
      </RadioGroup>
      {action === "partial" && (
        <Field label="Відсоток виплати виконавцю" htmlFor={`${id}-percent`} hint="Від 5 до 95, кратно 5. Рішення необоротне." error={percentValid ? null : "Вкажіть число від 5 до 95, кратне 5."}>
          <Input id={`${id}-percent`} inputMode="numeric" value={percent} onChange={(event) => setPercent(event.target.value.replace(/\D/g, "").slice(0, 2))} aria-invalid={percentValid ? undefined : true} className="tabular-nums" />
        </Field>
      )}
      <Field label="Коментар для сторін" htmlFor={`${id}-comment`} hint="Його побачать обидві сторони в розмові, а ми збережемо в журналі." error={commentError}>
        <Textarea id={`${id}-comment`} rows={4} value={comment} maxLength={DECISION_COMMENT_MAX} onChange={(event) => setComment(event.target.value)} placeholder="Що ви побачили в розмові й чому вирішили саме так" aria-invalid={commentError ? true : undefined} />
      </Field>
      {needsTotp && (
        <Field label="Код автентифікатора" htmlFor={`${id}-totp`} hint="Шість цифр із застосунку. Потрібен для рішень, що рухають гроші.">
          <Input id={`${id}-totp`} inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="tabular-nums" />
        </Field>
      )}
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
