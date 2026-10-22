# Телеметрія: помилки, аналітика, словник тегів

Усе лежить в окремій базі `TELEMETRY_DB` (помилки й події) та в головній
(пропозиції тегів). Код: `kit/telemetry` (не знає про застосунок),
`lib/telemetry` (Vibe Map). Поки немає адмінки, читаємо командою `npm run tel`
або SQL.

## Що пишемо

| Що | Де | Скільки живе | Звідки |
| --- | --- | --- | --- |
| Помилки браузера | `logs` + `log_issues` | 30 днів (групи без терміну) | `ErrorReporter`, `app/error.tsx`, `app/global-error.tsx` → `/api/k/r` |
| Помилки сервера | `logs` + `log_issues` | 30 днів | `failure()` у API, `instrumentation.ts`, воркер |
| Події аналітики | `events` | 180 днів | браузер → `/api/k/e`; сервер → `trackServer` |
| Лічильники лімітів | `kit_limits` | доба | самі |
| Пропозиції тегів | `tag_proposals`, `tag_proposal_uses` (головна база) | поки не закриємо | «Запропонувати „…“» |
| Слова із запитів, яких словник не знає | `tag_term_stats` (головна база) | одноразові 30 днів | публікація запиту |

**Чого немає:** текстів запитів, повідомлень, «Про себе», імен, пошти, телефонів.
Єдині винятки: нормалізовані слова, які шукали й не знайшли (`tag_search_empty.query`),
і фрагмент, з якого розпізнано тег, який людина прибрала (`tag_removed.phrase`):
до 40 символів і без контактів. IP не зберігається, лише хеш із сіллю.

## Згода

| Стан | Події | Ідентифікатор пристрою |
| --- | --- | --- |
| Ще не відповіла | летять | немає, сесія лише в пам'яті вкладки |
| «Добре» | летять | `anon_id` у localStorage, сесія в sessionStorage |
| «Не треба» або Global Privacy Control | не летять | немає |

Журнал помилок пишеться завжди, але без ідентифікатора пристрою, якщо згоди немає.

## Як читати

Команда: `npm run tel -- <звіт> --env development|production [--days N] [--local]`.
Час у виводі київський.

| Звіт | Що показує |
| --- | --- |
| `errors` | відкриті групи помилок, свіжі першими: скільки разів, де, у якому релізі, `fingerprint` |
| `issue <fingerprint>` | останні 5 випадків групи з подробицями (стек, маршрут, кроки перед падінням) |
| `events` | скільки разів кожна подія за період і скільки людей |
| `daily` | люди й події за днями |
| `funnel-customer` | воронка замовника: від карти до відгуку про роботу |
| `funnel-performer` | воронка виконавця: від «Я виконавець» до оплати розміщення |
| `tags` | звіт про словник тегів (див. нижче), копія в `.cache/tags-report-<дата>.md` |

Воронка рахує **охоплення**, а не сувору послідовність: скільки людей хоч раз
дійшло до кроку. Кроки задані в `lib/telemetry/reports.ts`. Свої сесії
(`?internal=1`) не рахуються.

### Сирий SQL

```bash
# Відкриті групи помилок
npx wrangler d1 execute TELEMETRY_DB --env production --remote --command "SELECT datetime(last_seen/1000,'unixepoch','+3 hours') AS коли, count, event, substr(message,1,80) AS текст, fingerprint FROM log_issues WHERE status='open' ORDER BY last_seen DESC LIMIT 20"

# Позначити виправленою в релізі (якщо помилка повернеться, група знову відкриється сама)
npx wrangler d1 execute TELEMETRY_DB --env production --remote --command "UPDATE log_issues SET status='resolved', resolved_release='<sha>' WHERE fingerprint='<fp>'"

# Ігнорувати (шум, який нас не стосується)
npx wrangler d1 execute TELEMETRY_DB --env production --remote --command "UPDATE log_issues SET status='ignored' WHERE fingerprint='<fp>'"

# Звідки приходять люди
npx wrangler d1 execute TELEMETRY_DB --env production --remote --command "SELECT COALESCE(utm_source, referrer, 'прямий') AS джерело, COUNT(DISTINCT COALESCE(user_id, anon_id, session_id)) AS люди FROM events WHERE name='page_view' AND internal=0 GROUP BY 1 ORDER BY 2 DESC"
```

Час у базі UTC, мілісекундами; до Києва +2 взимку й +3 влітку.

## Події

Усі назви в `lib/telemetry/events.ts`, поза словником сервер їх відкидає. **С**: подію
шле сервер (не пропаде через блокувальник).

| Група | Події |
| --- | --- |
| Карта | `page_view`, `map_ready {ms}`, `map_mode_switched {mode}`, `marker_clicked {tier}`, `group_clicked {size}`, `performer_profile_opened {from}`, `filter_group_toggled`, `filter_city_toggled`, `filter_online_toggled`, `filter_tag_toggled` |
| Замовник | `composer_focused`, `composer_tags_detected {tags}`, `request_submit_clicked {tags, has_budget, has_city, files}`, `auth_started {from}`, `auth_code_sent`, `auth_completed` **С**, `auth_failed {method, reason}`, `request_published` **С**, `offer_received` **С**, `offers_panel_opened {count}`, `offer_rejected`, `chat_opened {from}`, `message_sent` **С**, `deal_created/accepted/paid/completed` **С**, `review_left` **С** |
| Виконавець | `performer_cta_clicked {from}`, `profile_editor_opened`, `profile_saved` **С**, `profile_published` **С**, `placement_opened`, `placement_tier_selected`, `placement_paid` **С**, `feed_opened {count, matched}`, `response_sent` **С** |
| Теги | `tag_picker_opened`, `tag_search_empty {query}`, `tag_picked {tag, rank, via}`, `tag_added {tag, source}`, `tag_removed {tag, source, phrase}`, `tag_proposed` **С** |
| Сповіщення | `push_enabled`, `consent_chosen`, далі `telegram_link_started`, `telegram_linked` **С**, `telegram_unlinked` **С** |

Додати подію: рядок у `EVENTS`, виклик `track(EVENTS.x, {…})` (клієнт) або
`serverEvent(EVENTS.x, {…}, userId)` (сервер), рядок у цій таблиці. Властивості:
snake_case, до 15 штук, значення короткий рядок, число чи булеве.

## Раз на тиждень: поповнюємо словник тегів

1. `npm run tel -- tags --env production --days 30` (потрібен доступ до обох баз).
2. Звіт має п'ять розділів: пропозиції (сильніший сигнал), порожні пошуки,
   слова з запитів, яких словник не знає, хибні спрацювання, якість пошуку.
3. Для кожного кандидата вирішіть: **новий тег** (`lib/tags/groups/<група>.ts`
   із синонімами й супутниками в `companions.ts`), **синонім наявного**, **прибрати
   хибний синонім** чи пропустити.
4. `npm test`: `tests/unit/tags.test.ts` стежить, щоб одна фраза вела рівно до одного тегу.
5. Мерж і **деплой словника**.
6. **Лише після деплою** закрийте пропозиції:
   ```bash
   npm run tags:resolve -- --env production --phrase "webflow cms" --tag webflow
   npm run tags:resolve -- --env production --phrase "вебфлоу" --tag webflow --synonym
   npm run tags:resolve -- --env production --phrase "щось дивне" --reject --note "не про розробку"
   ```
   Скрипт ставить статус, перевіряє, що тег є в словнику цього коду, і додає його
   всім, хто просив (профілі й роботи; запити лише як сигнал). Чому після деплою:
   інакше наступне збереження профілю відкине тег, якого ще немає в задеплоєному коді.

Потім, з адмінкою: список пропозицій із кнопками замість скрипта, словник у D1
замість коду, повідомлення людині в Telegram «Тег „Webflow" додано у ваш профіль».
