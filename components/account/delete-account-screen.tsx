"use client";

// components/account/delete-account-screen.tsx
//
// «Видалити акаунт» (меню акаунта). Кілька полів і довгий текст, тож екран за DESIGN.md («Шари»): що зникне, що лишиться,
// галочка, слово ВИДАЛИТИ, код з пошти (для тих, у кого були угоди), закріплена кнопка внизу. Якщо видалити не можна,
// замість форми список перешкод із переходом до розмови. Правила: lib/server/account-delete.ts, текст політики: lib/legal/privacy.ts.

import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field, Input } from "@/components/ui/input";
import { Screen } from "@/components/ui/screen";
import { useDeleteAccount } from "@/components/account/use-delete-account";
import { DELETE_WORD, RETENTION_YEARS } from "@/lib/account/deletion";

const GONE = ["профіль, фото й роботи", "ваші запити та відгуки на чужі запити", "реквізити й ІПН, підключення Telegram, налаштування сповіщень", "листування в розмовах без угод", "вхід у акаунт: нею більше не увійти"];
const KEPT = [
  "угоди й платежі за розміщення: так вимагає облік, а вас у них показано як «Видалений користувач»",
  "листування в розмовах, де є угода, і скарги: вони потрібні сторонам, щоб довести, що сталося",
  "ваші відгуки про виконавців, підписані «Замовник»",
  "запис про те, що ви приймали умови",
];

const List = ({ items }: { items: string[] }) => (
  <ul className="grid list-disc gap-1 pl-5">
    {items.map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
);

export const DeleteAccountScreen = () => {
  const account = useDeleteAccount();
  const { load, status } = account;
  return (
    <Screen
      open={account.open}
      onOpenChange={(next) => !next && account.close()}
      title="Видалити акаунт"
      description="Що зникне, що лишиться, і як підтвердити видалення."
      desktop="dialog"
      footer={
        <Button className="w-full" disabled={!account.canSubmit} onClick={() => void account.submit()}>
          {account.busy ? "Видаляємо" : "Видалити акаунт"}
        </Button>
      }
    >
      <div className="grid gap-4 text-sm">
        {load.kind === "loading" && (
          <p role="status" className="text-ink-muted">
            Перевіряємо, чи можна видалити…
          </p>
        )}
        {load.kind === "error" && (
          <div className="grid gap-2">
            <p role="alert" className="auth-error">
              {load.message}
            </p>
            <Button variant="secondary" onClick={() => void account.retry()}>
              Спробувати ще раз
            </Button>
          </div>
        )}
        {account.blocked && status && (
          <div className="grid gap-2" role="alert">
            <h3 className="text-base font-semibold text-ink">Зараз видалити не можна</h3>
            <p>Закрийте те, що нижче, і поверніться сюди.</p>
            <ul className="grid gap-2">
              {status.blockers.map((blocker) => (
                <li key={`${blocker.kind}-${blocker.dealId}`} className="grid gap-1">
                  <span>{blocker.reason}</span>
                  {blocker.conversationId && (
                    <Button variant="link" className="justify-self-start" onClick={() => account.openChat(blocker.conversationId)}>
                      Відкрити розмову
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <section className="grid gap-2" aria-labelledby="delete-gone">
          <h3 id="delete-gone" className="text-base font-semibold text-ink">
            Що зникне
          </h3>
          <List items={GONE} />
        </section>
        <section className="grid gap-2" aria-labelledby="delete-kept">
          <h3 id="delete-kept" className="text-base font-semibold text-ink">
            Що лишиться
          </h3>
          <List items={KEPT} />
          <p className="text-ink-muted">Записи про угоди, платежі й скарги зберігаємо щонайменше {RETENTION_YEARS} роки після завершення угоди. Видалення не скасувати.</p>
        </section>
        {status && !account.blocked && (
          <div className="grid gap-3">
            <CheckboxField id="delete-ack" checked={account.checked} onCheckedChange={(value) => account.setChecked(value === true)} label="Я розумію, що акаунт не можна відновити" />
            <Field label={`Введіть слово ${DELETE_WORD}`} htmlFor="delete-word">
              <Input id="delete-word" value={account.word} onChange={(event) => account.setWord(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            </Field>
            {account.needsCode && (
              <div className="grid gap-2">
                <p className="text-ink-muted">У вас були угоди, тому підтвердьте видалення кодом із пошти.</p>
                <Button variant="secondary" disabled={account.busy} onClick={() => void account.sendCode()}>
                  Надіслати код на пошту
                </Button>
                <Field label="Код з пошти" htmlFor="delete-code">
                  <Input id="delete-code" value={account.code} onChange={(event) => account.setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} />
                </Field>
                <div role="status" aria-live="polite">
                  {account.codeNote && <p className="text-ink-muted">{account.codeNote}</p>}
                </div>
              </div>
            )}
          </div>
        )}
        {account.error && (
          <p role="alert" className="auth-error">
            {account.error}
          </p>
        )}
      </div>
    </Screen>
  );
};
