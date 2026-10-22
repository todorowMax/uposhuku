# kit

Код, який живе в кількох проєктах і не знає про жоден із них. Кожна папка
(`kit/telemetry`) самодостатня: свої міграції, свій README.

Зараз тут одне: **`kit/telemetry`**, власний журнал помилок (замість Sentry) і
аналітика (замість Amplitude), що пишуть у окрему D1.

## Правила

1. **Жодних імпортів застосунку.** У `kit/` немає `@/…` і шляхів за межі папки. Це перевіряє `tests/unit/kit-boundary.test.ts`.
2. **`core` без React і Next.** Він працює у воркері, в роуті й у тестах. React живе в `client`, Next у `next`.
3. **Зміна API: запис у `telemetry/CHANGELOG.md` і нова версія в `telemetry/VERSION`.**
4. Правки kit ідуть звичайним PR у проєкт, де їх зроблено. У репозиторій `web-kit` їх відправляє лише Макс (`npm run kit:push`).

## Як підключити до нового проєкту

Приклад із Vibe Map: `lib/telemetry/*`, `app/api/k/*`, `app/layout.tsx`.

1. **Код.** `git subtree add --prefix=kit git@github.com:todorowMax/web-kit.git main` (див. «Як оновлювати»).
2. **База.** `npx wrangler d1 create <проєкт>-telemetry-<env>` для кожного середовища.
3. **`wrangler.jsonc`**, у кожному середовищі в `d1_databases`:
   ```jsonc
   { "binding": "TELEMETRY_DB", "database_name": "<проєкт>-telemetry-<env>", "database_id": "<id>", "migrations_dir": "kit/telemetry/migrations" }
   ```
4. **`env.d.ts`**: `TELEMETRY_DB?: D1Database; RELEASE?: string;`. Без привʼязки телеметрія мовчки вимкнена, застосунок працює як працював.
5. **Міграції.** У `package.json`: `"db:telemetry:migrate:<env>": "wrangler d1 migrations apply TELEMETRY_DB --remote --env <env>"` (і `--local` для розробки).
6. **Конфіг** `lib/telemetry/server.ts`: `KitServerConfig` (база, хто увійшов, версія, сіль, дозволені події).
7. **Словник подій** `lib/telemetry/events.ts` і `track.ts`: застосунок свій, назви лише з нього.
8. **Роути** (нейтральна адреса, блокувальники ріжуть слова log/track/analytics):
   ```ts
   // app/api/k/r/route.ts
   export const { POST } = createReportRoute(telemetryConfig);
   // app/api/k/e/route.ts
   export const { POST } = createIngestRoute(telemetryConfig);
   ```
9. **Браузер.** У кореневий `app/layout.tsx`: `<Telemetry storagePrefix="..."/>` і банер згоди (`components/legal/consent-banner.tsx` як приклад).
10. **Сервер.** У загальний обробник помилок API: `logLater(...)` (див. `lib/telemetry/log.ts`); `instrumentation.ts` з `onRequestError`; у воркері: `logLater` із `env.TELEMETRY_DB`.
11. **Політика конфіденційності:** розділ «Статистика й журнал помилок» (див. `lib/legal/privacy.ts`). Без нього згода порожня.
12. **Тести.** Скопіюйте `tests/unit/kit-*.test.ts` і `tests/helpers/d1.ts` (він накочує міграції kit у `TELEMETRY_DB`).

## Як оновлювати

```bash
npm run kit:pull   # забрати зміни з web-kit у цей проєкт
npm run kit:push   # відправити свої правки kit у web-kit (лише Макс)
```

Обидві команди без `--squash`: змішування режимів ламає subtree. Якщо
`kit:pull` скаржиться на unrelated histories: `git rm -r kit`, коміт,
`git subtree add --prefix=kit <web-kit> main`.

## Що лежить усередині

```
telemetry/
  core/        logEvent, fingerprint, ліміти, events, звіти (SQL). Без React і Next
  next/        createReportRoute, createIngestRoute
  client/      Telemetry, ErrorReporter, аналітика, провайдери, згода
  migrations/  SQL для TELEMETRY_DB
```

Докладно, як читати дані й вести словник тегів: `docs/telemetry.md`.
