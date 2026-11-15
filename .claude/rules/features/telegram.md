---
paths: ["**/lib/telegram/**", "**/lib/server/telegram-repo.ts", "**/lib/server/notify*.ts", "**/app/api/telegram/**", "**/app/api/channel/**", "**/app/api/notifications/**"]
trigger: touching the Telegram bot, channel posts or notifications
---
# Telegram

Feature doc: `docs/features/telegram.md`; setup and privacy: `docs/telegram-bot.md`.

- A chat already linked to another account is handed over only after the chat owner's button (`relink_yes` / `relink_no`); the token is not spent before the answer.
- An update is marked handled only after it is processed (`isUpdateSeen`, `markUpdateSeen`).
- Texts built from user input go through `escapeHtml`; contacts are cut with `stripContacts` in anything public. Notices never put message text in an email.
