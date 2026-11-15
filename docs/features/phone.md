# Телефон замовника

Опис перенесено з `AGENTS.md` (розділи «Stack» і «Environments») 2026-11-15 без змін змісту. Правило для агента, що вантажиться при роботі з кодом цієї фічі: [.claude/rules/features/phone.md](../../.claude/rules/features/phone.md). Індекс фіч: [README.md](README.md).

## Де в коді

- `lib/phone/`, `components/phone/`, `lib/server/phone-repo.ts`, `lib/server/phone-gate.ts`, `app/api/phone/`; підтвердження в боті: `lib/telegram/handle-update.ts`.

## Опис

- Телефон замовника (`lib/phone/`, `lib/server/phone-repo.ts`, `lib/server/phone-gate.ts`): прапорець `phone_verify` (не грошовий), номер підтверджується лише в Telegram-боті кнопкою «Поділитися номером» (`user_id` контакту має дорівнювати `from.id`). У `users` лежать `phone_hash` (HMAC-SHA256 від E.164 з секретом `PHONE_HASH_KEY`, `openssl rand -hex 32`), `phone_mask` і `phone_verified_at`; номера в базі й журналі немає. Хеш унікальний серед живих акаунтів; «могила» зберігає хеш (маску ні): з боргом комісії чи в `phone_blocks` номер не віддається новому акаунту, без боргу віддається. Замовник без номера при увімкненому прапорці отримує 409 `phone_required` на публікації запиту, пропозиції й прийнятті угоди (`phoneGate`); без ключа підтвердження дає 503 і `phone_hash_key_missing`.

