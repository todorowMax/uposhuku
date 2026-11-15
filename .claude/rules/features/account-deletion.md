---
paths: ["**/lib/server/account-*.ts", "**/lib/account/**", "**/components/account/**", "**/app/api/account/**", "**/app/admin/deletions/**", "**/app/api/internal/tick/**"]
trigger: touching account deletion, data export, retention or the daily tick cleanup
---
# Account deletion

Feature doc: `docs/features/account-deletion.md` (tombstone, blockers, retention, export).

- A `users` row is never physically deleted: it becomes a tombstone (`deleted_at`, mail `deleted-<id>@deleted.invalid`). The code has no `DELETE` on `users`; a test checks it.
- Deletion is blocked while a deal has money in motion or a complaint is open; users with deals need a mail code (`lib/server/account-code.ts`).
- Retention is `RETENTION_YEARS = 3` (`lib/account/deletion.ts`); snapshot cleanup runs daily in `app/api/internal/tick`.
