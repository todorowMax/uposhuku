---
paths: ["**/lib/deals/**", "**/components/deals/**", "**/components/wallet/**", "**/components/requisites/**", "**/lib/crypto/**", "**/lib/monobank/**", "**/app/api/deals/**", "**/app/api/monobank/**", "**/app/api/crypto/**", "**/app/api/requisites/**", "**/lib/server/deal-*.ts", "**/lib/server/escrow-*.ts", "**/lib/server/safe-deal.ts", "**/lib/server/payment-repo.ts", "**/lib/server/payout-repo.ts", "**/lib/server/crypto-*.ts", "**/lib/admin/deal-timeline.ts"]
trigger: touching deals, payments, escrow, wallets, requisites or dispute helpers
---
# Deals and payments

Feature doc: `docs/features/deals-payments.md` (safe-deal mode, Monobank tokens, escrow cap, disputes, verified deal). Money code is covered by CORE-7: no test-only shortcuts in payment, auth or deletion code.

- "Frozen" and "paid out" are set only by a bank-confirmed answer (`lib/deals/payment-status.ts`); escrow stages take their status only from the contract state (`lib/deals/escrow-state.ts`, `lib/server/escrow-sync.ts`).
- New deals and payments ask the safe-deal mode (`lib/server/safe-deal.ts`); money already in motion (webhook, reconciliation, payout, sweep) never does.
- The escrow cap `CRYPTO_MAX_DEAL_USDT` is never above the factory limit read from the contract; production is 10000 until an audit.
- A transfer to IBAN, Binance, PayPal or Wise never makes a review "verified" (`lib/deals/verified.ts`).
- A new money action goes through `legalGate` (and `cryptoGate` for USDT): see `legal-consents`.
