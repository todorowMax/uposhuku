# Оновлення Next.js 15 до 16

- Created: 2026-10-24
- Project / repo: uposhuku
- Final status: partly done

## Goal

Перейти з Next 15.5.26 на актуальний Next 16, зберігши збірку Cloudflare/OpenNext і власний вхід воркера (`worker/index.ts`, WebSocket, Durable Object). Next 15 вийшов з вікна підтримки Next-команди (2026-10-21), і `opennextjs-cloudflare build` на 15.5.26 падав з «not supported by the Next.js team».

## Done criteria

- [x] `next` 16.4.3, `@opennextjs/cloudflare` 1.20.13, `wrangler` 4.152.0 у межах peer-діапазонів; `package-lock.json` узгоджений (`npm ls` без помилок). React 19.3.0 вже підходить (Next 16: `^19.0.0`).
- [x] `npm run typecheck`, `npm run lint`, `npm run lint:ci`, `npm test` зелені; стелі храповика не зросли (ESLint 852, Stylelint 11).
- [x] `opennextjs-cloudflare build` проходить; `.open-next/worker.js` збирається.
- [x] Власний вхід `worker/index.ts` піднято в локальному workerd (`cf:preview`): WebSocket і Durable Object працюють.
- [x] Головна й realtime відповідають локально (`cf:preview`, `next dev`).
- [ ] CI на GitHub (Linux) пройшов: не запускався.

## Items

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Базова лінія на Next 15 | done | typecheck 0; ESLint 852 w / 0 e; Stylelint 11; 281 тест; cf:build падав: «Next.js version 15.5.26 is not supported» |
| 2 | Гайд Next 16 і нотатки OpenNext, список змін | done | див. Decisions |
| 3 | Оновити пакети | done | next 16.4.3, opennext 1.20.13 (aws 4.1.12), wrangler 4.152.0; `npm ls` чистий |
| 4 | Виправити те, що зламалось | done | `tsconfig.json` (jsx, include), `next-env.d.ts` (генерується), `next.config.ts` (`agentRules: false`), `@next/eslint-plugin-next` лишився на 15.x |
| 5 | typecheck, lint, lint:ci, test | done | 0 / 852 w / 852 (стеля 852) і 11 (стеля 11) / 281 passed |
| 6 | Збірка OpenNext, вхід воркера | done | `npm run cf:build` exit 0, «OpenNext build complete»; `cf:preview`: WS 101 і ping/pong на `/api/realtime/global`, 401 на `/me` без сесії, 426 без upgrade |
| 7 | Локальний запуск | done | `cf:preview` (порт 8787) і `next dev` (3031): `/` 200, глобус рендериться, консоль без помилок |

## Decisions

- Застосунок не має `middleware`, власного `webpack`, `revalidateTag`, `next lint`, AMP, runtimeConfig, `next/image`, паралельних маршрутів, динамічних іконок і sitemap; усі `params`, `searchParams`, `cookies()`, `headers()` вже асинхронні (why: перевірено grep по `app`, `lib`, `components`). Тому кодових змін під breaking changes не знадобилось.
- Кодмод не запускали, пакети ставили вручну (why: нічого з його переліку тут не застосовується, а ручна установка дає чистий diff).
- `@next/eslint-plugin-next` лишаємо на `^15.5.28` (why: спільний лінтер `config/agent-rules/src/blocks.mjs` читає `nextPlugin.flatConfig.coreWebVitals`, у плагіні 16.x цього об'єкта немає, ESLint падає на завантаженні конфіга) -> записано в AGENTS.md. Виправлення в agent-rules: `nextPlugin.flatConfig?.coreWebVitals ?? nextPlugin.configs["core-web-vitals"]`.
- `agentRules: false` у `next.config.ts` (why: з Next 16.2 `next dev` сам дописує блок у AGENTS.md, коли бачить агента; єдине джерело правил там) -> stays here.
- `tsconfig.json`: лише обов'язкові зміни Next 16 (`jsx: react-jsx`, `.next/dev/types/**/*.ts` в `include`), у вихідному компактному форматі.

## Lessons (candidates)

- `@opennextjs/cloudflare` 1.20.13 (aws 4.1.12) сам прибрав помилку «Next 15 not supported»: підтримка Next-мажора триває до виходу другого наступного мажора. Для Next 15 вистачило б оновити OpenNext, не міняючи Next.
- `next dev` у Next 16.2+ пише в AGENTS.md, коли бачить агента: вимикати `agentRules: false` до першого запуску dev в сесії агента.
- `next dev` і `next build` по черзі переписують `next-env.d.ts` (шляхи `.next/dev/types` проти `.next/types`) і `tsconfig.json`; комітити форму після `build`.
- Next 16 прибрав `First Load JS` з виводу `next build`: правило COMP-14 («міряти на `next build`») тепер без джерела цифр.

## Not verified

- CI на Linux (`npm install` з новим локом): не запускали.
- Реальний деплой, remote D1, поведінка Durable Object на платформі: не запускали (заборонено).
- Обробник `scheduled` (`tick`): не викликали, бо він ходить у Telegram.
- Потоки з входом (пошта, Google), Telegram, завантаження файлів, чат, угоди, адмінка: тільки неавторизовані відповіді.
- Перегляд на 375 px і клавіатурою з фокус-кільцем: не робили (UI не змінювався), дивились лише у вікні браузера-панелі.
- Бюджет First Load JS: не міряли (його нема в AGENTS.md, а Next 16 прибрав цифри з виводу).

## Final status

2026-10-24: оновлено до Next 16.4.3 з OpenNext 1.20.13 і wrangler 4.152.0; усі перевірки і справжня збірка OpenNext зелені, воркер працює локально. Нічого не закомічено. Лишилось: CI на GitHub і рішення Макса по `agent-rules` (плагін ESLint).
