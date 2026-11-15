# Захист: заголовки, ліміти, Turnstile, ідентифікатори

Опис перенесено з `AGENTS.md` (розділи «Stack» і «Environments») 2026-11-15 без змін змісту. Правило для агента, що вантажиться при роботі з кодом цієї фічі: [.claude/rules/features/security.md](../../.claude/rules/features/security.md). Індекс фіч: [README.md](README.md).

## Де в коді

- `lib/security-headers.ts`, `next.config.ts`, `worker/index.ts`, `lib/server/rate-limit.ts`, `app/api/csp-report/`.
- Turnstile: `lib/server/turnstile.ts`, `lib/auth/turnstile-client.ts`, `components/auth/use-turnstile.ts`, `app/api/auth/turnstile/`.
- Ідентифікатори: `lib/ids.ts`. Грошові рішення модератора: `lib/server/admin-money.ts`.

## Опис

- Захист (`lib/security-headers.ts`, `lib/server/rate-limit.ts`): заголовки ставить воркер і `next.config.ts`. CSP розділено:
  `Content-Security-Policy` діє й містить лише `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`;
  повна політика зі `script-src` лишається в `Content-Security-Policy-Report-Only` (звіти в `/api/csp-report`), доки Next вставляє
  inline-скрипти без nonce. Нове зовнішнє джерело (скрипт, фрейм, мережа) дописується в `contentSecurityPolicy`, а форма з `action`
  на інший хост порушить `form-action`. HSTS не ставимо (зона Cloudflare). Ліміти частоти лежать у `RATE_RULES`.

- Turnstile на відправці коду входу (`lib/server/turnstile.ts`, `components/auth/use-turnstile.ts`): `TURNSTILE_SITE_KEY` (публічний,
  клієнт бере його з `GET /api/auth/turnstile`) і `TURNSTILE_SECRET` (секрет). Без обох перевірка вимкнена (локально, тести), на проді
  без них у журналі `turnstile_not_configured`. Погана перевірка: 400, siteverify недоступний: 503 (закрито). Для розробки тестові
  ключі Cloudflare (див. `.dev.vars.example`); тестовий секрет приймає будь-який токен, а відмову дає секрет `2x…AA`.

- Ідентифікатори нових `deal_`, `req_`, `conv_`, `rev_` це префікс і 16 hex (`lib/ids.ts`); старі 8-символьні живуть далі, id за
  довжиною не розбирають. Решта префіксів (`msg_`, `pay_`, `resp_` та інші) поки 8–12 символів.
  Грошові рішення модератора потребують `ADMIN_TOTP_SECRET`; на проді без нього вони вимкнені.

