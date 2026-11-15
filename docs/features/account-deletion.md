# Видалення акаунта й виписка даних

Опис перенесено з `AGENTS.md` (розділи «Stack» і «Environments») 2026-11-15 без змін змісту. Правило для агента, що вантажиться при роботі з кодом цієї фічі: [.claude/rules/features/account-deletion.md](../../.claude/rules/features/account-deletion.md). Індекс фіч: [README.md](README.md).

## Де в коді

- `lib/server/account-delete.ts`, `lib/server/account-code.ts`, `lib/server/account-export.ts`, `lib/server/account-retention.ts`, `lib/account/`, `components/account/`, `app/api/account/`, `app/admin/deletions/`, крок tick у `app/api/internal/tick/`.

## Опис

- Видалення акаунта (меню акаунта; `lib/server/account-delete.ts`, таблиця «що з чим» у шапці файла): рядок у `users` ніколи не видаляється фізично, він стає
  «могилою» (`deleted_at`, пошта `deleted-<id>@deleted.invalid`), бо на нього ведуть `onDelete: cascade` угод, платежів і відгуків. Видалити не можна, поки є угода
  з грошима в русі чи відкрита скарга; людям з угодами потрібен код з пошти (`lib/server/account-code.ts`). Виписка даних: `GET /api/account/export`. Строк зберігання
  `RETENTION_YEARS = 3` (`lib/account/deletion.ts`), прибирання знімків реквізитів раз на добу в `app/api/internal/tick`. У коді немає `DELETE` по `users`, це перевіряє тест.

