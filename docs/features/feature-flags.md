# Прапорці функцій

Опис перенесено з `AGENTS.md` (розділи «Stack» і «Environments») 2026-11-15 без змін змісту. Правило для агента, що вантажиться при роботі з кодом цієї фічі: [.claude/rules/features/feature-flags.md](../../.claude/rules/features/feature-flags.md). Індекс фіч: [README.md](README.md).

## Де в коді

- `lib/features/`, `lib/server/features.ts`, `app/api/features/`, `app/api/admin/features/`, `app/admin/features/`.
- Способи оплати виконавця, які вмикає `foreign_links`: [deals-payments.md](deals-payments.md).

## Опис

- Прапорці функцій (`safe_deal`, `crypto_proof`, `crypto_wallet`, `crypto_escrow`, `nbu_qr`, `foreign_links`): режим `off` | `allowlist` | `on`
  і список пошт. `foreign_links` вмикає PayPal і Wise у реквізитах (грошовий: TOTP і лист). Способи оплати виконавця
  (банк, USDT, гаманець, Binance ID, PayPal, Wise) в `lib/deals/requisites.ts`: усі поля необов'язкові, потрібен
  хоча б один спосіб; `paymentMethods()` дає список, `mask` без IBAN це мітка способу; «Я оплатив(ла)» пише
  `stage.paidVia` лише зі способів знімка. Значення з таблиці `feature_flags` (сторінка `/admin/features`), інакше зі змінних `<ІМ'Я>_MODE` і
  `<ІМ'Я>_USERS`, інакше `off`. Чиста логіка в `lib/features`, сервер у `lib/server/features.ts`. Зміна грошових
  прапорців потребує TOTP.

## Примітка до переносу (2026-11-15)

У вихідному тексті список прапорців не містив `postpaid_fee` («Комісія за фактом», рахунок на акаунті) і `phone_verify`; повний перелік у коді: `FEATURES` у `lib/features/flags.ts`, грошові (потрібен TOTP) у `MONEY_FEATURES` там само. `phone_verify` описано в [phone.md](phone.md), `postpaid_fee` у [задачі про комісію за фактом](../tasks/2026-11-14-postpaid-commission.md).
