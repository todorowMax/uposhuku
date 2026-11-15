# Угоди й оплата

Опис перенесено з `AGENTS.md` (розділи «Stack» і «Environments») 2026-11-15 без змін змісту. Правило для агента, що вантажиться при роботі з кодом цієї фічі: [.claude/rules/features/deals-payments.md](../../.claude/rules/features/deals-payments.md). Індекс фіч: [README.md](README.md).

## Де в коді

- Угоди: `lib/deals/`, `components/deals/`, `app/api/deals/`, `lib/server/deal-*.ts`, `lib/server/payment-repo.ts`, `lib/server/payout-repo.ts`.
- Безпечна угода, Monobank: `lib/server/safe-deal.ts`, `lib/monobank/`, `app/api/monobank/`.
- Крипта й ескроу: `lib/crypto/`, `components/wallet/`, `lib/server/escrow-gate.ts`, `lib/server/escrow-sync.ts`, `lib/server/crypto-config.ts`, `app/api/crypto/`.
- Допомога у спорах: `lib/deals/dispute-aids.ts`, `lib/deals/complaints.ts`, `lib/admin/deal-timeline.ts`.
- Реквізити виконавця: `lib/deals/requisites.ts`, `components/requisites/`, `app/api/requisites/`.

## Опис

- Wallets: wagmi 3 + viem + react-query (`components/wallet`, `lib/crypto/pay-flow.ts`). They load only through
  `next/dynamic` in the payment and requisites panels; nothing imports them on the home page or the map. The
  end-to-end check against a local Hardhat node is `npm run test:chain` (needs `contracts` built).
  Escrow deals (`method: "escrow"`, amounts in whole USDT, one contract clone per stage) take their stage status only from
  the contract state (`lib/deals/escrow-state.ts`, `lib/server/escrow-sync.ts`); `CRYPTO_MAX_DEAL_USDT` caps a deal
  (default 1000, never above the factory limit read from the contract). Wallet reads go through the connected wallet's provider.

- Escrow cap `CRYPTO_MAX_DEAL_USDT`: development 1000, production 10000 (`wrangler.jsonc`). The production contract
  is deployed with 50 000; raising the server cap above 10 000 waits for an audit. Code default 1000 is not changed.

- Безпечна угода (гроші через Monobank) вмикається змінними `SAFE_DEAL_MODE` = `off` (типово) | `allowlist` | `on`
  та `SAFE_DEAL_USERS` (пошти через кому). Нові угоди й оплата питають режим (`lib/server/safe-deal.ts`), гроші, що вже
  в русі (вебхук, звірка, виплата, sweep), його не питають. Юридичні тексти показують її лише в режимі `on`; крипту (розділ «Крипта» в умовах, отримувачі в політиці) лише коли хоч один із `crypto_proof`, `crypto_wallet`, `crypto_escrow` у режимі `on` (`cryptoPublic()` у `lib/server/safe-deal.ts`); про `foreign_links` вони не кажуть ніде.
  Токени: `MONOBANK_TOKEN` (звичайний термінал) і `MONOBANK_SPLIT_TOKEN` (розщеплення), `MONOBANK_PLATFORM_RECEIVER_ID`.
  «Заморожено» і «виплачено» ставить лише підтверджена банком відповідь (`lib/deals/payment-status.ts`).

- Допомога у спорах (`lib/deals/dispute-aids.ts`, `complaints.ts`, `lib/admin/deal-timeline.ts`): «Що вважаємо готовим» (до 500) ставиться
  при створенні умов і потім не змінюється; чек (`stage.receiptAttachmentId`) це картинка з розмови угоди, угода без `conversationId`
  чек не приймає; результат етапу (`stage.delivery`: текст до 1000 і https-посилання) додається до «здати етап». Скарга на пряму угоду
  (`deal_complaints`, `POST /api/deals/:id/complaint`) гроші й статус етапу не чіпає; закриває її модератор у `/admin?tab=complaints`,
  закриття (хто, коли, коментар) лежить у самому рядку скарги, окремого журналу немає. Друга сторона бачить лише службовий рядок у розмові.

- «Перевірена угода» (`reviews.verified`, `lib/deals/verified.ts`): сервер ставить її при створенні відгуку, якщо угода `completed` і оплату кожного етапу підтвердив банк (`paidAmount`), контракт (`paidUnits`) або блокчейн (запис у `crypto_proofs`). Переказ на IBAN, Binance, PayPal і Wise ніколи не дає позначки; старі відгуки мають `verified = 0`.

