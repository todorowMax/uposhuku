# Пакет J: технический долг кода и CI

- Created: 2026-11-16
- Project / repo: uposhuku
- Final status: in progress

## Goal

Закрыть найденное в ревью проекта (раздел 4: K-1, K-2, K-4, K-5, K-6): убрать мёртвый код, общие форматтеры, обёртку маршрутов API, тесты хуков, проверку бюджета и knip в CI, глубокую ссылку для публичного профиля и разнести `app/globals.css` по файлам. Нужно, чтобы дальше такие долги не росли молча.

## Done criteria

- [ ] `npm run deadcode` завершается с кодом 0
- [ ] форматтеры запросов лежат в одном модуле и покрыты тестами
- [ ] `route()` покрыта тестами, маршруты без `try/catch` переведены, ответы не изменились
- [ ] есть проект vitest с jsdom и тесты `use-thread`, `use-read-mark`, каждый падает при поломке поведения
- [ ] CI запускает `deadcode`, `next build` и `npm run budget`
- [ ] ссылка `/?open=performer:<id>` работает по чистой логике с тестами
- [ ] `globals.css` разнесён, равенство собранного CSS показано (или пункт снят)
- [ ] `lint:ci`, `typecheck`, `test`, `deadcode`, `budget` зелёные

## Items

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Мёртвый код и зависимости (knip) | in progress | |
| 2 | K-4: общие форматтеры `lib/requests/format.ts` | todo | |
| 3 | K-2: обёртка `route()` и перевод маршрутов без try/catch | todo | |
| 4 | K-5: проект vitest с jsdom, тесты `use-thread`, `use-read-mark` | todo | |
| 5 | K-6: CI, сборка и проверка бюджета | todo | |
| 6 | Глубокая ссылка `open=performer:<id>` | todo | |
| 7 | K-1 шаг 1: разнести `globals.css` | todo | |

## Decisions

- Порядок пунктов и по коммиту на пункт, каждый откатывается отдельно (why: задание).

## Lessons (candidates)

- нет

## Not verified

- заполнить в конце

## Final status

В работе.
