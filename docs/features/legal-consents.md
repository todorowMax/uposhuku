# Згоди й юридичні версії

Опис перенесено з `AGENTS.md` (розділи «Stack» і «Environments») 2026-11-15 без змін змісту. Правило для агента, що вантажиться при роботі з кодом цієї фічі: [.claude/rules/features/legal-consents.md](../../.claude/rules/features/legal-consents.md). Індекс фіч: [README.md](README.md).

## Де в коді

- `lib/legal/`, `components/legal/`, `lib/server/legal-repo.ts`, `lib/server/legal-gate.ts`, `app/api/legal/`.

## Опис

- Згоди (`legal_acceptances`, `lib/legal/acceptance.ts`, `lib/server/legal-repo.ts`, `lib/server/legal-gate.ts`): версії документів у `LEGAL_VERSIONS` (`lib/legal/config.ts`, рядок-дата), їх піднімають вручну, коли змінюється сенс тексту, і `UPDATED` рахується від них. Вхід вимагає `accepted: true` від нового (і від того, хто не приймав чинні умови та політику), запис із джерелом `signup`; `GET /api/legal/status`, `POST /api/legal/accept`. Грошові дії (створення й прийняття угоди, «я оплатив», заморожування, оплата безпечної угоди, розміщення, відгук) без чинних умов дають 409 `legal_reaccept_required`; дії з USDT (хеш, оплата з гаманця, ескроу, USDT і Binance ID в реквізитах, підтвердження гаманця, звірка з гаманцем замовника) ще й без `cryptoRisk` дають 409 `risk_ack_required`. Нова грошова дія з USDT на сервері додає `cryptoGate`; на клієнті `withRiskAck` (серверна відмова) або `ensureRiskAck` (до транзакції в гаманці). Нова версія документа дає повторне прийняття; у тестах `makeUser` приймає всі документи, `accepted: false` лишає без згод.

