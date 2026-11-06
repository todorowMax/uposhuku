# Findlyfy (uposhuku)

Карта виконавців і запитів в Україні. Людина описує, що потрібно зробити, і бачить на карті, хто поруч уже робив
схоже. Виконавці стають на карту за разову оплату розміщення, замовник і виконавець домовляються в чаті, гроші за
роботу йдуть через Monobank (безпечна угода), прямим переказом або в USDT TRC-20.

Стек: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, MapLibre GL, Drizzle на Cloudflare D1, R2 для
файлів, OpenNext на Cloudflare Workers.

## Встановлення й запуск

```bash
npm install
cp .dev.vars.example .dev.vars   # заповніть потрібне, див. нижче
npm run db:migrate:local         # локальна D1
npm run db:seed:local            # демо-виконавці й запити (за бажанням)
npm run dev                      # http://localhost:3031
```

Секрети й змінні лежать у `.dev.vars`. Файл у git не потрапляє, імена й пояснення є в `.dev.vars.example`.
Без пошти локально вхід працює з кодом `000000` (або `DEV_LOGIN_CODE`). `AUTH_SECRET` і `REQUISITES_KEY` потрібні завжди.

## Перевірка

| Команда | Що робить |
|---|---|
| `npm run lint` | ESLint і Stylelint (`lint:ci` ще й стежить, щоб попереджень не побільшало) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: логіка, репозиторії на in-memory D1 і R2, основні маршрути |
| `npm run test:chain` | Оплата USDT і ескроу проти локальної Hardhat-ноди; спершу `cd contracts && npm ci && npx hardhat build` |
| `npm run deadcode` | Невикористаний код (knip) |

CI (`.github/workflows/ci.yml`) запускає lint, typecheck і тести на pull request. Він нічого не деплоїть.

## Бази, деплой, прапорці

- Схема в `db/schema*.ts`; після правки `npm run db:generate`, нова міграція з'являється в `db/migrations`. Застосування:
  `db:migrate:local`, `db:migrate:development`, `db:migrate:production`. Телеметрія має свою базу
  (`db:telemetry:migrate:*`).
- Збірка воркера: `npm run cf:build`, локально `npm run cf:preview`. Деплой вручну:
  `npm run cf:deploy:development` (dev.findlyfy.com) і `npm run cf:deploy:production` (findlyfy.com).
  Секрети на воркер кладуть через `wrangler secret put`, у `wrangler.jsonc` їх немає.
- Функції з грошима й криптою вмикаються прапорцями `off | allowlist | on`: безпечна угода (`SAFE_DEAL_MODE`),
  `crypto_proof`, `crypto_wallet`, `crypto_escrow`, `nbu_qr`. Значення зберігає сторінка `/admin/features`, інакше
  беруться змінні `<ІМ'Я>_MODE` і `<ІМ'Я>_USERS`; за замовчуванням усе вимкнено.

## Карта і ресурси

Карта малює глобус на MapLibre: перший кадр складається з наших статичних картинок, деталі з масштабу 6,5 приходять
з [OpenFreeMap](https://openfreemap.org/) (дані OpenStreetMap, підпис про авторів обов'язковий) і AWS Terrain Tiles.
Портрети маркерів у демо вигадані; як їх готували, написано в `design/avatar-mock-asset.md`.

Статичні ресурси в `public/`:

- `npm run map:textures`, `map:assets`, `map:space`: текстури Землі й картинки першого кадру;
- `npm run map:faces`: різає атлас `public/map/mock-avatars.webp` на окремі фото демо-виконавців;
- `npm run font:build`: збирає підмножину шрифту Fixel (`public/fonts/FixelVariable.woff2`) з повного файлу в
  `design/fonts`; потрібні Python, `fonttools` і `brotli`.

Кордони беруться з `ne_10m_admin_0_countries_ukr` (Natural Earth, версія з погляду України, з Кримом); тест
`tests/unit/map-data.test.ts` падає, якщо контур перемалюють з іншого файлу.

## Куди дивитися далі

- `AGENTS.md`: стек, середовища, правила для розробки й агентів, бюджет першого завантаження.
- `DESIGN.md`: токени, розміри, кольори, компоненти.
- `docs/tasks`: плани й журнал задач; `docs/` загалом: специфікації, чернетки, дослідження.
