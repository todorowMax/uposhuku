# Telegram: бот, канал, сповіщення

Опис перенесено з `AGENTS.md` (розділи «Stack» і «Environments») 2026-11-15 без змін змісту. Правило для агента, що вантажиться при роботі з кодом цієї фічі: [.claude/rules/features/telegram.md](../../.claude/rules/features/telegram.md). Індекс фіч: [README.md](README.md).

## Де в коді

- `lib/telegram/`, `lib/server/telegram-repo.ts`, `app/api/telegram/`, `app/api/channel/`.
- Сповіщення: `lib/server/notify.ts`, `lib/server/notify-email.ts`, `lib/server/notify-matching.ts`, `app/api/notifications/`.
- Як увімкнути бота, приватність: [../telegram-bot.md](../telegram-bot.md).

## Опис

- Telegram: чат, уже прив'язаний до іншого акаунта, бот передає лише після кнопки власника чату (`relink_yes`/`relink_no`, токен
  не витрачається до відповіді); оновлення позначається обробленим після обробки (`isUpdateSeen`, `markUpdateSeen`).

