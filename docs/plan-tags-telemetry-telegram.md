# Теги, телеметрія й Telegram-бот: план задач

> 09.10.2026 · @Max. Записано зі слів Макса. Продовження [plan-mvp.md](plan-mvp.md).
>
> **Статус на 10.10.2026: блоки 1–4 зроблено в коді й покрито тестами (193+ тестів), блок 5 чекає на `web-kit`.** Що лишилось зробити вручну, і відхилення від плану: у розділі «Що зроблено й чим відрізняється від плану» нижче. Не закомічено: гілка `development`, зміни в робочій копії.
>
> **Як користуватися.** Кожна задача нижче самодостатня: її можна віддати Claude Code окремою сесією, наприклад «Зроби задачу 1.3 з docs/plan-tags-telemetry-telegram.md». Одна задача — одна гілка — один PR у `development`. Після мержу постав `[x]` у таблиці «Порядок і статус».

## Коротко

1. **Теги в профілі.** У «Ваші теги» з'являється «+ Додати тег»: випадайка з пошуком по всьому словнику (назви, синоніми українською, російською, англійською, транслітом, навіть набрані не в тій розкладці). Заодно лагодимо дві тихі вади: прибраний тег повертається після перевідкриття, а тег зі стертого слова не зникає.
2. **Свій Sentry і аналітика, один набір на кілька проєктів.** Беремо журнал помилок і аналітику з ukoshiku, кладемо в папку `kit/telemetry`, яка нічого не знає про застосунок, і пишемо все в окрему D1. Адмінки поки немає: читаємо SQL-запитами й скриптом `npm run tel`.
3. **Теги, яких немає.** Ловимо три сигнали: людина шукала тег і не знайшла, натиснула «Запропонувати „…“», замовники пишуть слова, яких словник не знає. Раз на тиждень звіт → поповнюємо словник → запропоновані теги самі з'являються в профілях тих, хто їх просив.
4. **Telegram-бот.** Прив'язка акаунта за одноразовим посиланням, сповіщення (пропозиції, повідомлення, угоди, запити під теги), публічний канал запитів із затримкою. Що потрібно від тебе — у розділі «Що потрібно від тебе».

## Що зроблено й чим відрізняється від плану

Блоки 1–4 реалізовано. Відхилення, які варто знати (у плані вище лишено початкові формулювання):

| Задача | Що вийшло інакше | Чому |
| --- | --- | --- |
| 1.1 | Пошук у `lib/tags/search.ts` рахує бали як у таблиці плану. Додано ще `searchTags` в `engine.ts`; без нечіткого пошуку (Левенштейн) | Як і планувалось: додамо, якщо звіт 3.3 покаже потребу |
| 1.2 | Теги з тіла запиту сервер ігнорує повністю й рахує сам (`combineTags`, `parseProfile`). Міграція `0003`, скрипт `db:backfill-tags:*` | Як у плані |
| 1.3 | Пікер `components/tags/tag-picker.tsx` + shadcn `popover`, `command`, `sheet`. `loadTagEngine` винесено окремо | Escape в пікері позначає подію оброблена, тож редактор під ним не закривається |
| 1.4 | У полі запиту «+ Додати тег» з'являється, коли в полі є текст (а не коли вже є теги) | Інакше до першого тегу пікер був би недоступний |
| 1.5 | У режимі виконавців: розділ «Теги» в панелі «Фільтри» (вбудований пікер); у режимі запитів: чип «+ Тег» у стрічці. Фільтр запитів за **точним** збігом тегу | Словник у фільтр запитів не вантажимо; підбір виконавців той самий, що й для тегів запиту |
| 2.1 | Привʼязка `TELEMETRY_DB` у `wrangler.jsonc` **без `database_id`**: локально й у тестах працює, для remote треба `wrangler d1 create` і вписати id | Реальні бази в акаунті Макса без його дозволу не створювали |
| 2.3 | `page_view` шле шлях **без параметрів** (у них бувають коди) | Приватність |
| 2.5 | `performer_profile_opened.from` поки лише `profile_page`; `deal_*` події шле сервер за діями в `app/api/deals/*` | З роуту не видно, звідки відкрили профіль |
| 2.6 | Воронка рахується як `WITH steps(VALUES …) LEFT JOIN`, а не `UNION ALL` | D1 не дозволяє понад кілька доданків у складеному SELECT (знайшов тест) |
| 3.1 | Для контексту `request` пропозиція лише сигнал (без чипа й без автододавання): id запиту на момент пропозиції невідомий | Спрощення |
| 3.2 | Є й подія аналітики `tag_search_empty`, і таблиця `tag_term_stats` зі словами із запитів | Як у плані |
| 4.1 | Вебхук поза воркером (тести, локально) чекає обробку, у воркері відповідає одразу (`ctx.waitUntil`) | Детермінізм тестів |
| 4.3 | Спільний файл `lib/notification-prefs.ts` (а не `lib/notifications/prefs.ts`) | `lib/notifications.ts` уже існує |
| 5.1, 5.2 | **Не робили** | Потрібен порожній репозиторій `web-kit` від Макса й окремий PR у ukoshiku |

## Що лишилось зробити вручну (потрібен Макс)

1. **Дві D1 для телеметрії** і `database_id` у `wrangler.jsonc`: `npx wrangler d1 create uposhuku-telemetry-development` (і `-production`), потім `npm run db:telemetry:migrate:development`.
2. **Міграції головної бази на dev:** `npm run db:migrate:development` (0003, 0004, 0005), потім `npm run db:backfill-tags:development`.
3. **Telegram-бот:** створити в @BotFather, секрети `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `INTERNAL_TOKEN` через `wrangler secret put … --env development`, вписати `TELEGRAM_BOT_USERNAME` у `wrangler.jsonc`, після деплою `TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npm run tg:setup -- --url <адреса воркера>`.
4. **Канал:** тестовий канал, бот адміном, id каналу з журналу (`telegram_chat_member`) у `TELEGRAM_CHANNEL_ID`, `CHANNEL_ENABLED=1`.
5. **`RELEASE`:** передавати git sha під час деплою (`--var RELEASE:$(git rev-parse --short HEAD)`), щоб помилки знали версію.
6. **Блок 5:** порожній приватний репозиторій `web-kit`, далі 5.1 і 5.2 за планом.
7. **Перевірити на dev-воркері:** `instrumentation.ts` (`onRequestError`) під OpenNext: тимчасова сторінка, що кидає, → рядок `server_render_error` у `logs`. Якщо запису немає, лишаються `failure()` і `digest` з `app/error.tsx`.

## Що я вирішив за тебе

Усе це можна змінити, але до старту відповідної задачі.

| # | Рішення | Чому | Альтернатива |
| --- | --- | --- | --- |
| 1 | Аналітика **своя**: події лягають у нашу D1, а не в Amplitude | Ти хочеш потім показувати все в адмінці. Зі своєї бази це один SQL, з Amplitude — їхній платний API або нічого. Сторонніх сервісів немає, політика простіша | Amplitude підключається другим провайдером одним файлом, як в ukoshiku: інтерфейс той самий |
| 2 | Телеметрія в **окремій D1** `TELEMETRY_DB`, не в головній базі | Набір переноситься між проєктами разом зі своїми міграціями й не плутається з міграціями drizzle. Записи подій не навантажують базу продукту. Прибирання старого не чіпає продукт | Таблиці в головній базі: на одну привʼязку менше, але kit тоді залежить від схеми застосунку |
| 3 | Переносимість через **папку `kit/` + git subtree**, без npm | Код фізично лежить у кожному репозиторії: CI, OpenNext і Cloudflare збирають без додаткових кроків, Богдан бачить код без доступу до окремого репозиторію. Оновлення ходять в обидва боки двома командами | Сабмодуль (CI і Богдану потрібен доступ до приватного репозиторію), `file:../kit` (не збереться в CI), shadcn-реєстр (добре для UI, незручно для серверу й міграцій) |
| 4 | Згода на статистику: **банер**, як і записано в DESIGN.md. Поки людина не відповіла — події йдуть без ідентифікатора пристрою (лише сесія в пам'яті вкладки). «Не треба» — жодних подій. Журнал помилок пишемо завжди, але без ідентифікаторів, якщо згоди немає | Не губимо воронку першого візиту й не зберігаємо нічого на пристрої без дозволу | Нічого не слати до згоди (як в ukoshiku): чесніше, але воронка першого візиту зникає |
| 5 | Зберігаємо: помилки 30 днів, події 180 днів, групи помилок (issues) без терміну | Помилки цінні, поки свіжі; поведінку порівнюємо по місяцях | — |
| 6 | Вручну додаються **лише теги зі словника**. Чого немає — пропозиція «на розгляді», у підборі не бере участі | Підбір рахує формула над словником; вільні теги його ламають | Вільні теги одразу: швидше для людини, але сміття в підборі й на карті |
| 7 | Ліміти: до 15 ручних тегів у профілі, до 30 разом; до 5 ручних у роботі. Сервер сам перераховує теги з тексту | Інакше виконавець додасть собі все підряд і вилізе в кожному запиті | — |
| 8 | Бот на голому Bot API (`fetch`), без бібліотек | Потрібні 6 методів; нуль залежностей, працює у воркері | grammY, якщо колись з'являться діалоги в боті |
| 9 | Два боти: тестовий (dev-воркер) і робочий (прод) | Вебхук у бота один, а адреси dev і прод різні | — |
| 10 | Telegram пише про пропозиції й повідомлення, **лише коли людина не на сайті** (немає відкритого сокета). Не частіше разу на 10 хв на розмову чи запит. 23:00–08:00 за Києвом — без звуку | Не дублюємо те, що людина й так бачить, і не будимо вночі | Затримка 2 хв і «ще не прочитано» — коли зробимо непрочитані |
| 11 | Канал запитів: затримка 20 хв (`CHANNEL_DELAY_MIN`), галочка «Показати в Telegram-каналі» увімкнена за замовчуванням, контакти з тексту вирізаємо, до 3 постів від людини на день, вимикач `CHANNEL_ENABLED` | Так записано в plan-mvp; захист від спаму й витоку контактів | Канал лише після ручної модерації (коли буде адмінка) |

**Зона відповідальності.** У plan-mvp теги, сповіщення й Telegram записані за Богданом. Узгодьте, хто що бере; задачі нижче від цього не залежать.

## Що потрібно від тебе

| Що | Для якої задачі | Як |
| --- | --- | --- |
| Дві D1 для телеметрії | 2.1 | `npx wrangler d1 create uposhuku-telemetry-development` і `… -production`, id передати в задачу (або дозволити Claude виконати ці команди) |
| Тестовий бот | 4.1 | @BotFather → `/newbot` → назва (видно людям, напр. «Vibe Map (тест)») → username на `_bot`, напр. `vibemap_dev_bot`. Там же `/setjoingroups` → Disable |
| Токен бота | 4.1 | **Не в чат і не в git.** `npx wrangler secret put TELEGRAM_BOT_TOKEN --env development`; для локальних тестів — у `.dev.vars` |
| Секрет вебхука | 4.1 | `openssl rand -hex 32` → `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --env development` і в `.dev.vars` |
| Username бота | 4.1 | Просто напиши його: це не секрет, піде у `wrangler.jsonc` як `TELEGRAM_BOT_USERNAME` |
| Аватар бота | 4.1 | 640×640, можна логотип. Тексти опису підготує задача 4.1 |
| Тестовий канал | 4.5 | Приватний канал, тестовий бот — адмін із правами «Публікувати» й «Редагувати повідомлення». Id каналу бот сам запише в журнал, коли ти його додаси (подія `my_chat_member`) |
| Робочий бот і публічний канал | перед продом | Те саме з `--env production`, після рішення про назву й домен. Поки прод не задеплоєний, бот живе на dev-воркері |
| Секрет для cron | 4.5 | `openssl rand -hex 32` → `npx wrangler secret put INTERNAL_TOKEN --env development` |
| Приватний репозиторій `web-kit` | 5.1 | Порожній, на GitHub, коли kit устоїться |
| Віддалені міграції й деплой | після кожного мержу | `npm run db:migrate:development`, `npm run db:telemetry:migrate:development`, `npm run cf:deploy:development` |

## Порядок і статус

Розмір: **S** — до пів дня, **M** — день, **L** — два-три дні роботи з Claude.

| Задача | Розмір | Залежить від | Статус |
| --- | --- | --- | --- |
| 1.1 Пошук по словнику тегів | S | — | [x] |
| 1.2 Звідки тег: з тексту, вручну, прихований | M | — | [x] |
| 1.3 «+ Додати тег» із пошуком у профілі | M | 1.1, 1.2 | [x] |
| 1.4 Пікер у роботах і в полі запиту | M | 1.3 | [x] |
| 1.5 Пошук тегу у фільтрах карти | M | 1.3 | [x] |
| 2.1 Каркас kit і окрема база | S | твої D1 | [x] |
| 2.2 Журнал помилок | L | 2.1 | [x] |
| 2.3 Аналітика: ядро | L | 2.1 | [x] |
| 2.4 Згода, політика, налаштування | M | 2.3 | [x] |
| 2.5 Події uposhuku | L | 2.3 | [x] |
| 2.6 Звіти без адмінки (`npm run tel`) | S | 2.2, 2.3 | [x] |
| 3.1 «Запропонувати тег» | M | 1.3 | [x] |
| 3.2 Сигнали словника | M | 2.3, 3.1 | [x] |
| 3.3 Звіт і поповнення словника | S | 2.6, 3.2 | [x] |
| 4.1 Каркас бота | M | токен | [x] |
| 4.2 Прив'язка акаунта | M | 4.1 | [x] |
| 4.3 Налаштування сповіщень на сервері | M | — | [x] |
| 4.4 Сповіщення в Telegram | L | 4.2, 4.3 | [x] |
| 4.5 Публічний канал запитів | L | 4.1, 4.4 | [x] |
| 5.1 Винести kit у `web-kit` | S | 2.1–2.5 | [ ] |
| 5.2 Підключити kit до ukoshiku | M | 5.1 | [ ] |

**Паралельні доріжки.** Теги (1.1 → 1.2 → 1.3) і телеметрія (2.1 → 2.2 → 2.3) не перетинаються, їх можна вести одночасно. Telegram (4.x) незалежний від обох; 4.3 можна робити будь-коли. Якщо робить одна людина, рекомендований порядок: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 2.6, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 1.4, 1.5, 5.1, 5.2.

## Загальні правила для кожної задачі

- **Гілка** `feature/<блок>-<що>` від свіжого `development` (`feature/tags-picker`, `feature/telemetry-errors`), PR назад у `development`.
- **Тексти інтерфейсу українською.** Російська лише в синонімах словника тегів.
- **shadcn first.** Новий компонент (popover, command, sheet, switch) спершу шукаємо в shadcn/ui, беремо Radix з пакета `radix-ui`, `cn` з `lib/utils.ts`, стилі `.ui-*` у `app/globals.css` під наш вигляд за DESIGN.md. Стандартний вигляд shadcn не лишаємо. Зразок — `components/ui/select.tsx`.
- **Анімації:** прості переходи стану на CSS, складні на GSAP. Framer Motion не додаємо. `prefers-reduced-motion` поважаємо.
- **API:** роути в `app/api/<модуль>/route.ts`, запити до бази в `lib/server/*-repo.ts`, помилки як `application/problem+json` через `problem()` і `failure()`, вхід через `requireApiUser()`, тіло перевіряємо руками, як у `lib/profile/validate.ts`.
- **База:** зміна `db/schema.ts` → `npm run db:generate` → `npm run db:migrate:local`. Віддалені міграції й деплой робить лише Макс.
- **Тести:** кожна задача додає тести в `tests/unit`, репозиторії й роути ганяємо на справжній D1 у пам'яті (`useTestD1()` з `tests/helpers/d1.ts`). Перед PR зелені `npm run typecheck` і `npm test`.
- **UI** перевіряємо в прев'ю (`npm run dev`, порт 3031) на ширині 1440 і 375 px; у консолі браузера немає помилок. Поведінку інтерфейсу дописуємо в DESIGN.md.
- **Коментарі** українською й пояснюють «чому», як у решті коду.
- **Секрети** лише через `wrangler secret put` і `.dev.vars`; у `.dev.vars.example` — назви з поясненням, без значень. Токени не потрапляють у журнали (особливо адреса Bot API: у ній токен).
- **Приватність телеметрії:** ніколи не шлемо текстів, які написали люди (запити, повідомлення, «Про себе»), імен, пошти, телефонів. Єдиний виняток — пошукові запити по словнику тегів (3.2): нормалізовані, до 40 символів, без контактів.

---

## Блок 1. Теги в профілі: «+» і пошук

Що є зараз. Словник у коді (`lib/tags/groups/*.ts`, ~535 тегів, ~7,8 тис. фраз), розпізнавання з тексту (`lib/tags/detect.ts`), сірі пропозиції (`lib/tags/suggest.ts`), стан тегів поля в хуку `lib/tags/use-tagging.ts`, чипи `components/profile/tag-chips.tsx`. У профілі теги беруться зі спеціальності й «Про себе» (`components/profile/profile-editor.tsx`, блок «Ваші теги»), у роботах — з опису роботи (`components/profile/work-editor.tsx`). Додати тег, якого немає в тексті, можна лише сірою «+», якщо його запропонувала матриця супутників.

### 1.1 Пошук по словнику тегів

**Навіщо.** Основа і для «+» у профілі, і для фільтрів карти: людина пише «тг бот», «фігма», «нова пош» і бачить потрібний тег, навіть якщо в назві інші слова.

**Залежить від:** нічого. **Розмір:** S.

**Файли.** Новий `lib/tags/search.ts`, тест `tests/unit/tags-search.test.ts`. Експорт `searchTags` з `lib/tags/engine.ts`, щоб пікер отримав пошук тим самим окремим шматком, що й словник.

**Що зробити**

1. `searchTags(query, { limit = 30, exclude = [] })` повертає `TagHit[]`: `{ tagId, score, via: "label" | "synonym" | "id", phrase }`, де `phrase` — фраза словника, що збіглася (для підказки «за словом „тг бот“»).
2. Індекс будується один раз і ліниво, як `phraseIndex()` у `detect.ts`: для кожного тегу назва, id (дефіси → пробіли) і синоніми. Кожна фраза зберігається у двох видах: `normalizeTagText(phrase)` і `phraseKey(phrase)` (основи слів). Запит нормалізуємо так само.
3. Бал тегу — найкращий серед його фраз:

   | Збіг | Бал |
   | --- | --- |
   | Точно назва | 100 |
   | Точно синонім або id | 90 |
   | Назва починається із запиту | 80 |
   | Синонім починається із запиту | 70 |
   | Кожне слово запиту — початок якогось слова назви (порядок не важливий: «бот тг») | 60 |
   | Те саме для синоніма | 50 |
   | Збіг за основами (`phraseKey`): «стоматологію» → «Стоматологія» | 45 |
   | Підрядок у назві чи синонімі, якщо запит від 3 символів | 30 |
   | Запит в англійській розкладці («asuvf» — це «фігма»): ті самі правила по перекладеному запиту | мінус 15 |

   Рівні бали: спершу коротша назва, потім `localeCompare(…, "uk")`.
4. Порожній запит або один символ → `[]`: порожній стан пікера показує пропозиції, а не пошук.
5. Швидкодія: ~8 тис. фраз, лінійний прохід на кожне натискання. Якщо один пошук на ноутбуці довший за 2 мс, додати префіксний індекс. Тест на час не пишемо: у CI він флакає.

**Готово, коли** (усе це — кейси тесту)

- «тг бот» → першим `telegram-bot`, `via: "synonym"`.
- «телеграм» → `telegram-bot` і `telegram-api` у першій п'ятірці.
- «нова пош» → першим `nova-poshta`.
- «сайт» → першим `website`, далі його нащадки.
- «Figma», «FIGMA», « figma » → однаковий результат; «asuvf» → `figma` у першій трійці.
- `exclude: ["telegram-bot"]` прибирає тег із видачі.
- «» і «а» → `[]`; «qwertyzxc» → `[]`.

**Не робимо.** Нечіткий пошук з помилками (Левенштейн). Додамо, якщо звіт 3.3 покаже, що люди часто помиляються.

### 1.2 Звідки тег: з тексту, вручну, прихований

**Навіщо.** У профілі зараз дві тихі вади, і ручне додавання їх посилить:

- **Прибраний хрестиком тег повертається** після перевідкриття редактора: `useTagging` знову знаходить його в тексті, а список прибраних живе лише в пам'яті.
- **Тег зі стертого слова не зникає:** після збереження всі теги приходять у хук як `initial` і далі поводяться як додані вручну.

Щоб «+» працював чесно, кожен тег має знати, звідки він.

**Залежить від:** нічого. **Розмір:** M.

**Модель**

- Нова колонка `source` у `profile_tags` і `project_tags`: `auto` (знайдено в тексті), `manual` (додано пікером або сірою «+»), `hidden` (знайдено в тексті, але людина прибрала). Первинний ключ не міняється: один тег — одне джерело.
- Тип `Profile` (`lib/profile/types.ts`): `tags` лишається підсумковим списком (його бачать замовники й підбір). Додаються `manualTags: string[]` і `hiddenTags: string[]`. У `ProfileWork` так само `manualTags` і `hiddenTags`.
- Підсумок рахує одна функція `resolveTags({ text, manual, hidden, limit })` = (теги з тексту ∪ ручні) − приховані, обрізано до ліміту. Її викликають і клієнт (живий перегляд), і сервер.
- **Сервер не вірить списку `tags` від клієнта.** `parseProfile` (`lib/profile/validate.ts`) рахує теги сам: з `specialty + bio` + `manualTags` − `hiddenTags`; для робіт — з `title + description`. Так само, як `withTags` для запитів. Тоді через API не дописати собі теги повз текст і ліміти.
- `PROFILE_LIMITS`: `manualTags: 15`, `tags: 30` (зараз сервер ріже до 40), `workManualTags: 5`. Перевірити, що демо-профілі з `scripts/seed-dev.ts` вкладаються.

**Що зробити**

1. `db/schema.ts`: колонка `source text not null default 'auto'` у `profile_tags` і `project_tags` → `npm run db:generate` → нова міграція в `db/migrations`.
2. `lib/server/profile-repo.ts`: `saveProfile` пише всі три види рядків; `assemble` збирає `tags` (лише `auto` і `manual`), `manualTags`, `hiddenTags`, те саме для робіт. Карта, підбір і стрічка читають лише `tags` — перевірити `listPublishedProfiles` і `lib/feed/feed.ts`, що `hidden` туди не протікає.
3. `useTagging(text, { manual, hidden }, suggestionLimit)`: стан `added` стає `manual`, `dismissed` — `hidden`, обидва стартують зі збереженого. Хук віддає `manual` і `hidden`, щоб редактор їх зберіг. Правила:
   - хрестик на тезі з тексту → у `hidden`;
   - хрестик на ручному тезі → просто вийняти з `manual`;
   - додати тег, який зараз у `hidden` → вийняти з `hidden` (він знову з тексту);
   - додати тег, якого в тексті немає → у `manual`.
4. `profile-editor.tsx` і `work-editor.tsx`: зберігати нові поля; знімок «було — стало» (`snapshot`) їх включає.
5. Перенесення наявних профілів: скрипт `scripts/backfill-tag-sources.ts` за зразком `seed-dev.ts` (генерує SQL у `.cache/`). Для кожного профілю й роботи розпізнає теги з тексту: збережені теги, яких у тексті немає, стають `manual`, решта — `auto`. Команди `db:backfill-tags:local` і `db:backfill-tags:development`. Прод порожній, там не потрібно.

**Готово, коли**

- Прибрав тег із тексту → зберіг → відкрив знову: тега немає, слово не підкреслене.
- Стер у «Про себе» слово, з якого був тег: тег зник одразу й після збереження.
- Тег, доданий сірою «+», лишається, навіть якщо його немає в тексті.
- `PUT /api/profile` з вигаданими `tags` у тілі зберігає лише теги з тексту й `manualTags`; понад ліміт обрізає.
- Тести: `tests/unit/profile.test.ts` (resolveTags, ліміти, сервер ігнорує `tags`), `tests/unit/repos.test.ts` (три джерела зберігаються й читаються, `hidden` не потрапляє в опубліковані профілі).

### 1.3 «+ Додати тег»: випадайка з пошуком у «Ваші теги»

**Навіщо.** Людина додає будь-який тег зі словника, не підбираючи слів у тексті, і знаходить його пошуком.

**Залежить від:** 1.1, 1.2. **Розмір:** M.

**Компоненти**

- `components/ui/popover.tsx` — shadcn Popover (Radix із `radix-ui`, вже є в залежностях).
- `components/ui/command.tsx` — shadcn Command; потрібна залежність `cmdk` (`npm i cmdk`). Вбудоване фільтрування cmdk вимкнене (`shouldFilter={false}`): результати дає `searchTags`, бо cmdk не знає про синоніми й основи.
- `components/ui/sheet.tsx` — shadcn Sheet (на Radix Dialog, без нових залежностей) для телефона.
- Стилі `.ui-popover-*`, `.ui-command-*`, `.ui-sheet-*` у `app/globals.css` у тому самому вигляді, що `.ui-select-*`.
- `components/tags/tag-picker.tsx` — пікер, який не знає про профіль. Пропси: `selected: string[]`, `auto: ReadonlySet<string>` (які з вибраних прийшли з тексту), `suggestions: string[]`, `labelOf`, `onToggle(tagId)`, `context: "profile" | "work" | "request" | "filter"`, `limitReached: boolean`, `onPropose?: (text) => void` (з'явиться в 3.1), `trigger: ReactNode`, `inline?: boolean` (для фільтрів, 1.5).
- `TagChips` отримує слот `addButton`.

**Поведінка**

- Кнопка-чип «+ Додати тег» стоїть останньою в рядку тегів. Видна й тоді, коли тегів ще немає: під підказкою «Розкажіть про себе вище…» з'являється «+ Додати тег вручну».
- **Десктоп:** Popover під кнопкою, ширина 360px, висота до 420px. **До 640px:** шторка знизу (Sheet), висота 75vh, поле пошуку вгорі, щоб клавіатура не перекривала список.
- Поле пошуку з автофокусом, плейсхолдер «Пошук: Telegram-бот, Figma, стоматологія…».
- **Порожній запит:** розділ «Пропонуємо» (до 8 тегів із `suggestTags` за поточними тегами), далі «Усі теги» шістьма групами з `TAG_GROUPS`, у групі за абеткою. 535 рядків cmdk тягне без віртуалізації; перевірити на телефоні, і якщо гальмує, згорнути групи до 8 тегів із «Показати всі (N)».
- **Із запитом:** плоский список до 30 результатів за балом. Рядок: назва (збіглі літери жирним), праворуч дрібно назва групи; якщо знайшлося через синонім — під назвою «за словом „тг бот“».
- Вибраний тег із галочкою; Enter або клік перемикає. Після вибору поле очищується, а пікер лишається відкритим: зазвичай додають кілька.
- Тег, що вже є з тексту, теж із галочкою; зняти його тут — те саме, що хрестик (піде в `hidden`).
- **Нічого не знайшлося:** «Такого тегу поки немає». Кнопку «Запропонувати „…“» додає задача 3.1.
- **Ліміт:** коли ручних тегів 15, нові пункти неактивні з підказкою «Вручну можна додати до 15 тегів. Теги з тексту в цей ліміт не входять».
- **Клавіатура й доступність:** ↑ ↓, Enter, Escape закриває й повертає фокус на кнопку (cmdk і Radix дають це з коробки). Кнопка з `aria-haspopup="dialog"` і `aria-expanded`.
- **Анімація:** поява на CSS за `data-state` Radix (opacity і зсув на 4px, 140 мс); з `prefers-reduced-motion` без руху.
- Новий тег одразу видно в «Ваші теги» і в живому перегляді картки праворуч.

**Готово, коли**

- На 1440 і 375 px: пошук «тг бот» → «Telegram-бот» → чип у профілі → «Зберегти» → після перевідкриття тег на місці (`source = 'manual'`).
- Escape, клік повз і повторний клік по кнопці закривають пікер; фокус повертається на кнопку.
- Ліміт 15 тримається і в інтерфейсі, і на сервері.
- DESIGN.md, розділ «Профіль виконавця»: абзац про «+ Додати тег».

**Не робимо.** Теги поза словником (3.1), пікер у роботах і полі запиту (1.4), фільтри (1.5).

### 1.4 Пікер у роботах і в полі запиту

**Навіщо.** Той самий спосіб додати тег усюди, де є теги.

**Залежить від:** 1.3; якщо 3.1 уже зроблена, «Запропонувати» працює й тут. **Розмір:** M.

1. **Роботи** (`components/profile/work-editor.tsx`): кнопка «+ Додати тег» у тегах роботи, `context: "work"`, ліміт 5 ручних. Ручний тег роботи вважаємо підтвердженим, як і тег із тексту роботи: людина прямо каже, що це було в проєкті. Ліміт 5 не дає перетворити одну роботу на «підтверджую все».
2. **Поле запиту** (`components/composer/tag-row.tsx`, стан тегів у `components/composer/request-composer.tsx`: `added`, `dismissed`): чип «+» у кінці рядка і в панелі «ще +N» відкриває пікер з `context: "request"`. Вибрані теги йдуть у запит як додані. Перевірити, що `withTags` (`lib/requests/derive-tags.ts`) не губить їх на сервері.
3. Після 2.5 — подія `tag_added { source: "picker", context }`.

**Готово, коли:** у роботі й у полі запиту можна знайти й додати тег пошуком; запит публікується з цим тегом, і виконавці з ним бачать запит у стрічці.

### 1.5 Пошук тегу у фільтрах карти

**Навіщо.** «Пошук по тегах» для замовника: знайти на карті всіх, хто робить, наприклад, Webflow, не пишучи запит.

**Залежить від:** 1.3. **Розмір:** M.

1. Панель «Фільтри» (`components/composer/specialist-filters.tsx`): новий розділ «Теги» вгорі — той самий `TagPicker` у вбудованому вигляді (`inline`, без Popover) і вибрані теги чипами.
2. Вибрані теги фільтра живуть у новому сторі `filterTags` у `lib/map/filters.ts`. Для підбору вони зливаються з тегами поля запиту в один список і проходять той самий `matchScore` і `MATCH_THRESHOLD` (`lib/tags/match.ts`), що й запит. Так пошук і фільтр працюють однаково, як вирішено в plan-mvp («Вибрані чипи — це ті самі теги, що й у запиті»).
3. Чипи груп і лічильники перераховуються з урахуванням `filterTags`; «Усі» знімає й теги фільтра.
4. Режим «Запити»: той самий фільтр звужує запити на карті (`applyRequestFilter` у `lib/feed/map-requests.ts`).
5. Після 2.5 — подія `filter_tag_toggled { tag, on }`.

**Готово, коли:** вибір «Webflow» лишає на карті тих, у кого Webflow або схожий тег; зняв — усе повернулося; працює разом із містом і «Онлайн»; на телефоні панель не вилазить за екран.

---

## Блок 2. Телеметрія: свій Sentry і аналітика (`kit/telemetry`)

### Що беремо з ukoshiku і що міняємо

| | ukoshiku | тут |
| --- | --- | --- |
| Помилки | Таблиця `logs` у головній D1 (`lib/logging/log.ts`), `/api/log` лише із сесією, `ErrorReporter`, `app/error.tsx` | Окрема `TELEMETRY_DB`. Анонімні звіти теж (карта відкрита без входу), з лімітом за хешем IP. Однакові помилки групуються в issues з лічильником і статусом, як у Sentry. Реліз (git sha), сліди останніх дій (breadcrumbs), серверні 500 пишуться самі |
| Аналітика | Amplitude (`lib/analytics/*`): провайдер із 4 методів, словник подій, черга до старту, згода, `?internal=1` | Ті самі 4 методи й черга, але провайдер свій: батчі на наш роут → таблиця `events`. Amplitude можна підключити другим провайдером |
| Конверсії | Лише з браузера | Ще й `trackServer` з API: реєстрацію, публікацію запиту, угоду не заблокує жоден блокувальник |
| Згода | Банер, до відповіді нічого | Банер; до відповіді — без ідентифікатора пристрою; відмова — нічого (рішення 4) |
| Перевикористання | Код у `lib/`, прив'язаний до застосунку | Папка `kit/telemetry` без жодного імпорту із застосунку; застосунок дає лише конфіг |

### Як влаштовано

```
браузер                                      воркер (Next)                          D1 TELEMETRY_DB
<ErrorReporter/> ─ reportError() ─ POST /api/k/r ─▶ createReportRoute ─ logEvent() ─▶ logs, log_issues
track()/page() ─ черга ─ sendBeacon /api/k/e ─────▶ createIngestRoute ─ insertEvents() ─▶ events
                                  API-роути ─ failure() ─ logEvent() ──────────────▶ logs, log_issues
                                  API-роути ─ trackServer() ───────────────────────▶ events
                                  worker/index.ts (сокети, cron) ─ logEvent(env.TELEMETRY_DB)
```

```
kit/
  README.md            як підключити до проєкту, як оновлювати, правила
  VERSION              0.1.0
  CHANGELOG.md
  telemetry/
    core/              без React і Next: працює у воркері, в роуті, в тестах
      types.ts         рівні, входи, KitServerConfig
      serialize.ts     безпечний JSON: Error, цикли, межа довжини
      fingerprint.ts   групування однакових помилок
      limits.ts        ліміти на таблиці kit_limits
      log.ts           logEvent(), forgetUser(); ніколи не кидає
      events.ts        insertEvents(), trackServer()
      ua.ts            пристрій, браузер, ОС, боти з User-Agent
      prune.ts         прибирання за терміном
    next/              тонкі адаптери для App Router
      report-route.ts  createReportRoute(config) → { POST }
      ingest-route.ts  createIngestRoute(config) → { POST }
    client/            "use client"
      report-error.ts, error-reporter.tsx, breadcrumbs.ts
      analytics.ts, providers/own.ts, providers/noop.ts
      ids.ts, consent.ts, internal.ts, page-views.tsx
    migrations/        SQL для TELEMETRY_DB
      0001_limits.sql, 0002_logs.sql, 0003_events.sql
```

Застосунок дає лише адаптер: `lib/telemetry/server.ts` (конфіг: база, хто увійшов, реліз, сіль), `lib/telemetry/events.ts` (словник подій), `lib/telemetry/client.tsx` (`<Telemetry/>` у `app/layout.tsx`) і два роути: `app/api/k/r/route.ts`, `app/api/k/e/route.ts`.

**Чому `/api/k/*`.** Загальні правила блокувальників ріжуть адреси зі словами analytics, track, collect, log. Нейтральна адреса не губить дані через чужі списки, а вибір самої людини ми поважаємо через згоду й GPC.

### 2.1 Каркас kit і окрема база

**Залежить від:** твоїх двох D1 (розділ «Що потрібно від тебе»). **Розмір:** S.

1. `wrangler.jsonc`, у кожному середовищі в `d1_databases` друга привʼязка: `{ "binding": "TELEMETRY_DB", "database_name": "uposhuku-telemetry-<env>", "database_id": "…", "migrations_dir": "kit/telemetry/migrations" }`.
2. `env.d.ts`: `TELEMETRY_DB?: D1Database` (без неї телеметрія мовчки вимкнена), `RELEASE?: string`.
3. `package.json`: `db:telemetry:migrate:local` (`wrangler d1 migrations apply TELEMETRY_DB --local --env development`), `…:development`, `…:production`.
4. Структура `kit/` як вище: README (поки чернетка), VERSION `0.1.0`, CHANGELOG, порожні модулі з типами.
5. `kit/telemetry/core/types.ts`:
   ```ts
   export interface KitServerConfig {
     app: string;                       // "uposhuku"
     env: string;                       // DEPLOY_ENV
     release?: string;                  // git sha
     db(): D1Database | null;           // null — телеметрія вимкнена
     userId(): Promise<string | null>;  // хто увійшов; клієнту не віримо
     salt: string;                      // для хешу IP; застосунок дає AUTH_SECRET
     allowedEvents?: ReadonlySet<string>;
     waitUntil?(work: Promise<unknown>): void;
   }
   ```
6. `0001_limits.sql`: `kit_limits (key text, window integer, count integer, primary key (key, window))`. `core/limits.ts`: `hit(db, key, windowMs, max)` — один `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`, повертає «можна чи ні».
7. Застосунок: `lib/telemetry/server.ts` — `db: () => getCloudflareContext().env.TELEMETRY_DB ?? null`, `userId` через `getSessionUser()` з `lib/server/auth.ts`, `waitUntil` через `getCloudflareContext().ctx`, `salt` з `AUTH_SECRET`.
8. Тести: `tests/helpers/d1.ts` накочує ще й `kit/telemetry/migrations` у `TELEMETRY_DB` і кладе його в `globalThis.__TEST_TELEMETRY_D1`; `vitest.config.mts` включає `kit/**/*.test.ts`.
9. `tests/unit/kit-boundary.test.ts`: жоден файл у `kit/` не імпортує `@/…` чи шляхи за межами `kit/`; `kit/telemetry/core` не імпортує `react` і `next`.

**Готово, коли:** `npm run db:telemetry:migrate:local` накочує міграції; тест межі й `hit()` зелені; typecheck зелений.

### 2.2 Журнал помилок (свій Sentry)

**Залежить від:** 2.1. **Розмір:** L.

**Таблиці** (`0002_logs.sql`)

```sql
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  level TEXT NOT NULL,          -- error | warn | info
  source TEXT NOT NULL,         -- client | server | worker
  event TEXT NOT NULL,          -- короткий код: unhandled_error, api_error, telegram_send_failed
  message TEXT NOT NULL DEFAULT '',
  detail TEXT,                  -- JSON до 4000 символів (до 12000 за явним detailMax)
  fingerprint TEXT NOT NULL,
  user_id TEXT, anon_id TEXT, session_id TEXT, ip_hash TEXT,
  route TEXT, release TEXT, env TEXT, user_agent TEXT, country TEXT
);
CREATE INDEX idx_logs_created ON logs(created_at);
CREATE INDEX idx_logs_fp ON logs(fingerprint, created_at);
CREATE INDEX idx_logs_event ON logs(event, created_at);

-- Групи однакових помилок: те, що в Sentry називається issue.
CREATE TABLE log_issues (
  fingerprint TEXT PRIMARY KEY,
  event TEXT NOT NULL, message TEXT NOT NULL, level TEXT NOT NULL,
  first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',   -- open | resolved | ignored
  resolved_release TEXT, last_release TEXT
);
```

**Ядро** (`kit/telemetry/core`)

- `serialize(detail, max)` — перенести з ukoshiku (`lib/logging/log.ts`): Error, циклічні посилання, межа довжини.
- `fingerprint({ source, event, message, stack })`: повідомлення в нижньому регістрі, числа → `0`, uuid і hex від 8 знаків → `#`, текст у лапках → `'…'`, адреси → лише домен; перший кадр стека — ім'я функції й файл без хешу чанка (`/_next/static/chunks/app/page-3f2a1b.js:1:2345` → `app/page.js`). SHA-256, перші 16 hex. Можна передати свій `fingerprint` явно.
- `logEvent(db, config, input)` **ніколи не кидає**. Одним `db.batch`: рядок у `logs` і для `warn`/`error` upsert у `log_issues` (`count + 1`, `last_seen`, `last_release`; `resolved` знову стає `open` — регресія; `ignored` лишається). З імовірністю 1% прибирає `logs` старші 30 днів і `kit_limits` старші доби.
- `logLater(config, input)` — те саме через `waitUntil`, щоб не затримувати відповідь.
- `forgetUser(db, userId)` — обнуляє `user_id` у `logs` і `events`. Викликати, коли з'явиться видалення акаунта.

**Роут звітів із браузера** (`createReportRoute`, `app/api/k/r/route.ts`)

- Тіло понад 16 КБ → 413. Зламаний JSON → 200 без запису.
- Поля: `level` (error | warn), `event` (до 64 символів, `^[a-z][a-z0-9_]*$`, інакше `client_error`), `message` (до 500), `detail`, `route` (до 200), `breadcrumbs` (до 20), `anonId`, `sessionId`.
- Ліміти через `kit_limits`: увійшов — 40 на годину на людину; гість — 20 на годину на `ip_hash` (SHA-256 від `IP + salt`, сам IP не зберігаємо); на весь застосунок — 2000 на годину. Понад ліміт — `{ ok: true, throttled: true }`.
- `user_id` береться із сесії, `country` із `cf-ipcountry`, `release` і `env` з конфігу.
- Завжди 200: клієнт ніколи не показує людині помилку про помилку.

**Сервер у uposhuku**

1. `lib/server/route.ts`: `failure(error, request?)` для всього, крім `AuthError`, пише `logLater({ level: "error", source: "server", event: "api_error", message, detail: { stack, method, path } })`. Передати `request` в усіх викликах `failure(` (зараз їх 10 у 8 роутах).
2. `instrumentation.ts` з `onRequestError` (Next 15): `server_render_error` з `digest`, `routePath`, `routeType`. **Перевірити на dev-воркері**, що OpenNext це викликає: тимчасова сторінка, що кидає, → рядок у `logs`. Якщо ні — записати це в README kit і спиратися на `failure()` і `digest` з `app/error.tsx`.
3. `worker/index.ts`: помилки в `realtime()` → `logEvent(env.TELEMETRY_DB, …, { source: "worker", event: "realtime_error" })` через `ctx.waitUntil`.
4. Доменні відмови, як в ukoshiku (не баги коду, а «в людини щось не вийшло»): `mail_send_failed` (`lib/server/mail.ts`), `upload_rejected` (`lib/server/uploads.ts`, warn, з типом і розміром), `realtime_push_failed` (`lib/server/realtime.ts`, замість `console.warn`).

**Браузер**

1. `client/report-error.ts`: `reportError()` — `fetch` з `keepalive` на `/api/k/r`; та сама подія з тим самим текстом не частіше разу на 60 с; не більше 10 звітів за завантаження сторінки; додає сліди, маршрут, ідентифікатори (лише ті, що дозволяє згода).
2. `client/error-reporter.tsx`: `<ErrorReporter ignore={[…]}/>` — `error` і `unhandledrejection`, як в ukoshiku. Шум відкидаємо: `ResizeObserver loop`, `Script error.` без стека, файли з `chrome-extension://` і `moz-extension://`, `AbortError`.
3. `client/breadcrumbs.ts`: кільце з 20 останніх кроків (перегляди сторінок і події аналітики) — щоб у звіті було видно, що людина робила перед падінням.
4. Нові `app/error.tsx` і `app/global-error.tsx` (зараз їх немає, тож людина бачить стандартний екран Next): скляна картка «Щось зламалося. Ми вже знаємо й розбираємося», «Спробувати ще раз» (`reset`) і «На карту». `global-error.tsx` має свої `<html>` і `<body>` та імпортує `globals.css`. Обидва шлють `render_error` з `digest`.
5. Карта: `map.on("error")` у `components/maplibre/maplibre-scene.tsx` → `map_error`, крім обірваних і 404 тайлів; не більше 3 за сесію.
6. `<Telemetry/>` з `<ErrorReporter/>` у `app/layout.tsx`.

**Реліз.** `RELEASE` = короткий git sha. Передати у wrangler під час деплою (`--var RELEASE:$(git rev-parse --short HEAD)`); перевірити, як `opennextjs-cloudflare deploy` прокидає аргументи у wrangler, і якщо ніяк — скрипт перед деплоєм дописує значення у `vars`. Клієнту реліз не потрібен: сервер додає свій під час запису.

**Як читати** (до адмінки). Створити `docs/telemetry.md` із запитами. Час у базі UTC, до Києва +2 взимку й +3 влітку.

```bash
# Відкриті групи помилок, свіжі першими
npx wrangler d1 execute TELEMETRY_DB --env development --remote --command "SELECT datetime(last_seen/1000,'unixepoch') AS коли, count, event, message, fingerprint FROM log_issues WHERE status='open' ORDER BY last_seen DESC LIMIT 20"

# Останні випадки однієї групи з подробицями
npx wrangler d1 execute TELEMETRY_DB --env development --remote --command "SELECT datetime(created_at/1000,'unixepoch') AS коли, route, release, detail FROM logs WHERE fingerprint='<fp>' ORDER BY created_at DESC LIMIT 5"

# Позначити виправленою в релізі
npx wrangler d1 execute TELEMETRY_DB --env development --remote --command "UPDATE log_issues SET status='resolved', resolved_release='<sha>' WHERE fingerprint='<fp>'"
```

**Готово, коли**

- Тести ядра: `logEvent` пише рядок і issue; та сама помилка двічі → `count = 2`, один fingerprint; «id 123» і «id 456» → один fingerprint; `resolved` після нового випадку → `open`; без бази `logEvent` не кидає.
- Тести роуту: гість 21-й раз за годину → `throttled`; тіло 20 КБ → 413; зламаний JSON → 200 без запису; `user_id` із тіла ігнорується.
- Руками на `npm run dev`: у консолі браузера `setTimeout(() => { throw new Error("kit test") })` → рядок у локальній `TELEMETRY_DB`.
- `app/error.tsx` видно, якщо компонент кидає (перевірити тимчасовим `throw` і прибрати).
- `docs/telemetry.md` із запитами вище.

### 2.3 Аналітика: ядро

**Залежить від:** 2.1; 2.2 бажано (сліди). **Розмір:** L.

**Таблиця** (`0003_events.sql`)

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,           -- uuid з браузера: повторна відправка не задвоює (INSERT OR IGNORE)
  ts INTEGER NOT NULL,           -- час події, поправлений на зсув годинника клієнта
  received_at INTEGER NOT NULL,
  name TEXT NOT NULL,
  props TEXT,                    -- JSON: до 15 ключів, рядки до 100 символів, числа, булеві
  source TEXT NOT NULL,          -- client | server
  user_id TEXT,                  -- лише із сесії
  anon_id TEXT,                  -- null, поки немає згоди
  session_id TEXT NOT NULL,      -- 'server' для серверних подій
  path TEXT, referrer TEXT,      -- referrer: лише домен
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
  device TEXT, browser TEXT, os TEXT, country TEXT,
  internal INTEGER NOT NULL DEFAULT 0,
  release TEXT
);
CREATE INDEX idx_events_name_ts ON events(name, ts);
CREATE INDEX idx_events_ts ON events(ts);
CREATE INDEX idx_events_user ON events(user_id, ts);
```

**Клієнт** (`kit/telemetry/client/analytics.ts`, перенесення `lib/analytics/index.ts` з ukoshiku)

- API: `startAnalytics({ providers, consent })`, `track(name, props?)`, `page(path)`, `identify(userId)`, `setConsent(state)`. Інтерфейс провайдера той самий: `init`, `track`, `identify`, `page`. Провайдерів може бути кілька: свій + Amplitude в ukoshiku.
- Черга до старту — до 50 подій, як в ukoshiku.
- **Свій провайдер** (`providers/own.ts`): буфер; відправка на 10 подіях або через 5 с; на `visibilitychange` → hidden і `pagehide` — `navigator.sendBeacon(endpoint, Blob JSON)`, запасний шлях — `fetch` з `keepalive`. Батч до 25 подій і 16 КБ. Не вдалося — до 100 подій чекають у пам'яті наступної спроби (у localStorage не пишемо).
- Подія: `{ id: crypto.randomUUID(), name, props, ts, path, sessionId, anonId? }`; батч: `{ sentAt, events, internal, referrer?, utm? }` (referrer і utm — лише в першому батчі сесії).
- **Ідентифікатори** (`client/ids.ts`):
  - згода `granted`: `anon_id` у localStorage (`vm:aid`), сесія в sessionStorage (`vm:sid`), нова після 30 хв без дій;
  - відповіді ще немає: сесія лише в пам'яті вкладки, без `anon_id`;
  - `denied`: `track()` нічого не робить, черга викидається;
  - `navigator.globalPrivacyControl === true` вважаємо відмовою, доки людина сама не натисне «Добре».
- **Властивості:** ключі `^[a-z][a-z0-9_]{0,39}$`, до 15 штук; значення — рядок до 100 символів, скінченне число або булеве; решта відкидається. Id наших сутностей (`request_id`, `deal_id`) можна: за ними склеюються воронки.
- `?internal=1` і `?internal=0` — перенести `lib/analytics/internal.ts`; позначка йде в батчі.
- `<PageViews/>`: `usePathname` і `useSearchParams` у Suspense, захист від подвійного ефекту в StrictMode (перенести з `components/analytics.tsx` ukoshiku).
- Кожен `track()` і `page()` пише слід у `breadcrumbs` (2.2).

**Сервер** (`createIngestRoute`, `app/api/k/e/route.ts`)

- Понад 16 КБ → 413; зламаний JSON → 204.
- Боти за User-Agent (`bot|crawler|spider|headless|lighthouse|pagespeed|preview|facebookexternalhit|telegrambot|whatsapp`) → 204 без запису.
- Ліміт: 300 подій за 10 хв на `ip_hash`; понад — 204 без запису.
- Подія: назва за `^[a-z][a-z0-9_]{1,63}$` і зі словника `allowedEvents`; `id` — uuid; час: `ts + (now − sentAt)`, обмежений проміжком [now − 24 год, now + 1 хв].
- `user_id` — із сесії через `config.userId()`, ніколи з тіла. Після входу події несуть і `anon_id`, і `user_id`: так дії гостя до входу склеюються з акаунтом.
- `device`, `browser`, `os` з `core/ua.ts` (прості регулярні вирази, без бібліотек), `country` з `cf-ipcountry`.
- `INSERT OR IGNORE` одним `db.batch`; з імовірністю 1% прибирання подій старших 180 днів. Відповідь 204.

**Серверні події.** `trackServer(config, name, props, { userId })` через `waitUntil`, `source = 'server'`, `session_id = 'server'`. Для кроків, які не має права загубити блокувальник (список у 2.5).

**Застосунок.** `lib/telemetry/events.ts` — `EVENTS` і тип `EventName`; `allowedEvents = new Set(Object.values(EVENTS))`. `<Telemetry/>` запускає аналітику; поки немає банера (2.4), згода в стані «ще не відповів».

**Готово, коли**

- Тести: батч із 3 подій → 3 рядки, той самий батч ще раз → все одно 3; невідома назва відкинута; довгий текст у props відкинутий; бот-UA → 0 рядків; `user_id` береться із сесії; ліміт за IP працює.
- Руками: відкрити карту → у `events` є `page_view`; закрити вкладку → батч долетів (sendBeacon).
- У вкладці «Мережа» — один запит на кілька секунд активності, а не на кожну подію.
- Перший завантажений JS головної виріс не більше ніж на ~5 КБ (вивід `next build`).

### 2.4 Згода, політика, налаштування

**Навіщо.** DESIGN.md уже каже: «з'явиться аналітика, додаємо запит згоди й правимо політику».

**Залежить від:** 2.3. **Розмір:** M.

1. `kit/telemetry/client/consent.ts` — перенести з ukoshiku (`lib/analytics/consent.ts`), ключ сховища з конфігу (`vm:consent`).
2. `components/legal/consent-banner.tsx`: маленька скляна картка внизу ліворуч над кнопкою акаунта; на телефоні — над нижніми кнопками на всю ширину з відступами 16px. Текст: «Рахуємо, як користуються Vibe Map, щоб робити його кращим. Без реклами й сторонніх сервісів.» Кнопки «Добре» і «Не треба», посилання «Детальніше» → `/legal/privacy#statistics`. Не перекриває поле запиту й шторки.
3. Показуємо, якщо вибору ще немає і немає GPC, через 3 с після `data-map-ready`, щоб не заважати першому кадру карти.
4. «Добре» → `setConsent("granted")`: поточна сесія стає постійною (ідентифікатор не міняється, щоб не рвати воронку), з'являється `anon_id`. «Не треба» → черга викидається, події більше не йдуть.
5. Змінити вибір: перемикач «Статистика використання» в `components/account/notification-settings.tsx` і кнопка «Змінити вибір» на сторінці політики (для гостей).
6. Політика (`lib/legal/*`, `/legal/privacy`), розділ «Статистика й журнал помилок»: що збираємо (дії без текстів, сторінка, тип пристрою, браузер, країна, ідентифікатори), де (наша база Cloudflare D1, без третіх сторін), скільки (події 180 днів, помилки 30), як відмовитися (банер, налаштування, GPC). Журнал помилок — законний інтерес; без згоди — без ідентифікатора пристрою.
7. DESIGN.md: замінити речення «Аналітики й рекламних кук немає…» описом банера.

**Готово, коли:** банер з'являється один раз і зникає після вибору; «Не треба» → у мережі немає запитів на `/api/k/e`; «Добре» → у подіях є `anon_id`; розділ політики є (тест у `tests/unit/legal.test.ts`).

### 2.5 Події uposhuku: словник і розстановка

**Залежить від:** 2.3. **Розмір:** L (місць багато, кожне просте).

**Правила словника** (коментар угорі `lib/telemetry/events.ts`): назви snake_case; подія відповідає на «чи дійшла людина до цього кроку», а не «що взагалі відбувалося»; у властивостях немає вільного тексту. Серверні події позначені **С**.

**Карта**

| Подія | Коли | Властивості | Де |
| --- | --- | --- | --- |
| `page_view` | зміна адреси | `path` | kit, сам |
| `map_ready` | намальовано перший кадр | `ms` (від навігації) | `lib/map/ready.ts` |
| `map_mode_switched` | «Виконавці / Запити» | `mode` | `components/map/mode-switch.tsx` |
| `marker_clicked` | клік по аватарці | `tier`, `own` | `components/maplibre/maplibre-scene.tsx` |
| `group_clicked` | клік по ромбу групи | `size` | там само |
| `performer_profile_opened` | профіль виконавця | `from`: card, offers, chat, url | `components/profile/profile-view.tsx` |
| `filter_group_toggled` | чип групи | `group`, `on` | `components/composer/specialist-filters.tsx` |
| `filter_city_toggled` | місто у фільтрах | `city`, `on` | там само |
| `filter_online_toggled` | «Онлайн» | `on` | там само |

**Замовник: від запиту до угоди**

| Подія | Коли | Властивості | Де |
| --- | --- | --- | --- |
| `composer_focused` | перший фокус у сесії | — | `components/composer/request-composer.tsx` |
| `composer_tags_detected` | уперше з'явився тег у чернетці | `tags` (кількість) | там само |
| `request_submit_clicked` | «Знайти виконавців» | `tags`, `has_budget`, `has_city`, `files` | там само |
| `auth_started` | відкрилась панель входу | `from`: request, account, performer, chat | `components/auth/auth-panel.tsx` |
| `auth_code_sent` | пошту прийнято | — | там само |
| `auth_completed` **С** | вхід або реєстрація | `method`: email, google; `new_user` | `app/api/auth/email/verify`, колбек Google |
| `auth_failed` | невірний код, відмова Google | `method`, `reason` | панель входу; колбек Google — **С** |
| `request_published` **С** | запит у базі | `request_id`, `tags`, `has_budget`, `remote` | `app/api/requests/route.ts` (POST) |
| `offer_received` **С** | відгук на запит | `request_id`, `n` (порядковий) | `app/api/feed/[id]/response` |
| `offers_panel_opened` | відкрив пропозиції | `count` | `components/requests/offers-panel.tsx` |
| `offer_rejected` | «Відхилити» | — | там само |
| `chat_opened` | відкрив розмову | `from`: offers, profile, inbox, telegram | offers-panel, `components/profile/direct-chat.tsx`, `components/chat/inbox-panel.tsx` |
| `message_sent` **С** | повідомлення в базі | `role`, `has_contacts` (з `lib/chat/contacts.ts`) | `app/api/conversations/[id]/messages` |
| `deal_created`, `deal_accepted`, `deal_paid`, `deal_completed` **С** | стани угоди | `deal_id`, `kind`: safe, direct; `stages` | `app/api/deals/*` |
| `review_left` **С** | відгук про роботу | `stars` | `app/api/reviews` |

**Виконавець**

| Подія | Коли | Властивості | Де |
| --- | --- | --- | --- |
| `performer_cta_clicked` | «Я виконавець» / «Стати виконавцем» | `from` | `components/account/account-button.tsx` |
| `profile_editor_opened` | | `has_profile` | `components/profile/profile-editor.tsx` |
| `profile_saved` **С** | | `published`, `tags`, `manual_tags`, `works`, `has_location` | `app/api/profile/route.ts` (PUT) |
| `profile_published` **С** | уперше опубліковано | — | там само |
| `placement_opened` | «Стати на карту» | `from` | `components/placement/placement-panel.tsx` |
| `placement_tier_selected` | вибрав рівень | `tier`, `price` | там само |
| `placement_paid` **С** | оплата пройшла | `tier`, `amount` | `app/api/placement/route.ts` |
| `feed_opened` | «Запити для вас» | `count`, `matched` | `components/requests/feed-panel.tsx` |
| `response_sent` **С** | відгукнувся | `request_id`, `has_price`, `matched_tags` | `app/api/feed/[id]/response` |

**Теги** — у задачі 3.2. **Сповіщення:** `push_enabled` (`lib/notifications.ts`), `notification_prefs_changed { channel, kind, on }`, `telegram_link_started`, `telegram_linked` **С**, `telegram_unlinked` **С**.

**Готово, коли:** кожна подія з таблиць хоч раз з'являється в локальній `events` після проходу сценарію руками (замовник у одному браузері, виконавець в іншому, як в «Як спробувати» з plan-mvp); `docs/telemetry.md` містить цю таблицю; подія не зі словника на сервері відкидається.

### 2.6 Звіти без адмінки

**Залежить від:** 2.2, 2.3. **Розмір:** S.

1. `scripts/telemetry.ts`, команда `npm run tel -- <звіт> --env development|production [--days 7]`. Запускає `wrangler d1 execute TELEMETRY_DB --remote --env <env> --json --command "…"` і друкує таблицю.
2. Звіти:
   - `errors` — відкриті issues, свіжі першими;
   - `issue <fingerprint>` — 5 останніх випадків із `detail`;
   - `events` — кількість кожної події за N днів без `internal`;
   - `daily` — люди за днями (`count(distinct coalesce(user_id, anon_id, session_id))`);
   - `funnel-customer` і `funnel-performer` — скільки людей дійшло до кожного кроку за період (порядок кроків задано в скрипті за таблицями 2.5). Не строга послідовність, але для старту досить;
   - `tags` — додає задача 3.3.
3. `docs/telemetry.md`: як користуватися й сирий SQL кожного звіту.

**Готово, коли:** кожен звіт відпрацьовує на dev-базі й не друкує нічого, крім таблиці.

---

## Блок 3. Теги, яких немає в словнику

Три сигнали, від найсильнішого до найслабшого:

1. **Людина натиснула «Запропонувати „…“»** — прямо каже, чого не вистачає. Зберігаємо в головній базі, бо це продуктові дані: пропозиція видна людині як чип «на розгляді» й сама стає тегом, коли ми його додамо.
2. **Шукала в пікері й не знайшла** — подія аналітики.
3. **Замовник написав слово, якого словник не знає** — агрегована статистика без прив'язки до людини.

Плюс якість наявного: які теги з тексту люди прибирають (хибні синоніми) і на якому місці у видачі стоїть те, що вибирають (якість пошуку).

### 3.1 «Запропонувати тег»

**Залежить від:** 1.3. **Розмір:** M.

**Таблиці** (`db/schema.ts`)

```ts
tag_proposals:      id (pk), phrase_key (unique: phraseKey(text)), text (як написала перша людина, до 40),
                    status: new | added | mapped | rejected (default new), resolved_tag_id, note,
                    created_at, updated_at
tag_proposal_uses:  proposal_id (fk, cascade), user_id (fk users, cascade),
                    context: profile | work | request, entity_id (default ''), created_at
                    pk (proposal_id, user_id, context, entity_id)
```

**API** (`app/api/tags/proposals/route.ts`, `lib/server/tag-proposal-repo.ts`)

- `POST { text, context, entityId? }`, лише з сесією:
  - текст обрізаний, 2–40 символів, хоча б одна літера, лише `[\p{L}\p{N} +#.'’-]`; з контактами (`mentionsContacts`) — 400;
  - якщо `searchTags(text)` знаходить тег із балом від 90 → 200 `{ existing: tagId }`: клієнт додає цей тег і показує «Такий тег уже є: Telegram-бот»;
  - до 10 пропозицій від людини за добу, далі 429 problem+json «Забагато пропозицій за день»;
  - upsert пропозиції за `phrase_key` (текст лишається від першої людини), запис у `tag_proposal_uses` (повтор ігнорується);
  - відповідь `{ proposal: { id, text, status } }`; після 2.3 — `trackServer("tag_proposed", { context })`.
- `GET` — мої пропозиції з контекстом. Простіше віддавати їх разом із профілем у `GET /api/profile` полем `pendingTags: { id, text }[]` (лише власнику).
- `DELETE /api/tags/proposals/[id]?context=&entityId=` — прибрати свою пропозицію.

**Інтерфейс**

- Порожній результат у пікері: «Такого тегу поки немає» і кнопка «Запропонувати „webflow cms“».
- Після натискання — чип «на розгляді»: пунктирна рамка, значок годинника, підказка «На розгляді. Коли додамо тег у словник, він з'явиться у вашому профілі сам». Хрестик → DELETE.
- Такі чипи не входять у ліміт і мінімум тегів, не беруть участі в підборі й не видні в публічній картці.
- Для запиту (якщо 1.4 вже є): до публікації пропозиції живуть у стані поля, а `POST /api/requests` приймає `proposals: string[]` і створює їх уже з `entity_id` запиту.

**Готово, коли:** «Webflow CMS» і «webflow  cms» від двох людей → одна пропозиція, два використання; ліміт 10 на добу; `existing` повертається для «тг бот»; текст із телефоном відхилено; чип «на розгляді» переживає перевідкриття редактора (тести репозиторію й роуту).

### 3.2 Сигнали словника

**Залежить від:** 2.3, 3.1. **Розмір:** M.

**Події з пікера й чипів** (додати в `lib/telemetry/events.ts`; шлють `TagPicker`, `TagChips`, `useTagging`)

| Подія | Коли | Властивості |
| --- | --- | --- |
| `tag_picker_opened` | відкрив пікер | `context` |
| `tag_search_empty` | нічого не знайшлося: 700 мс після останнього символу, запит від 3 символів, раз на кожен різний запит за відкриття | `context`, `query` (нормалізований, до 40, без контактів) |
| `tag_picked` | вибрав результат пошуку | `context`, `tag`, `rank` (місце у видачі, з 0), `via` |
| `tag_added` | додав тег | `context`, `tag`, `source`: suggestion, picker |
| `tag_removed` | прибрав тег | `context`, `tag`, `source`: auto, manual; для auto — `phrase`: фрагмент тексту, з якого розпізнано (нормалізований, до 40) |

`query` і `phrase` — єдиний дозволений виняток із правила «без вільного тексту», записати це в коментарі словника.

**Незнайомі слова в запитах** (сервер, головна база)

- Таблиця `tag_term_stats`: `term_key` (pk, основи слів через `phraseKey`), `sample` (як написано, до 40), `requests` (лічильник), `first_seen`, `last_seen`. Без прив'язки до людини чи запиту.
- `lib/tags/unknown-terms.ts`: `unknownTerms(text)` — слова й пари сусідніх слів, які не потрапили в жодну згадку `detectTagMentions`; лише літери (без цифр, `@`, адрес); довжина 3–30; не стоп-слово (`lib/tags/stopwords.ts`: ~400 найчастіших українських, російських і англійських слів); без повторів; до 20 на текст.
- Виклик у `POST /api/requests` після запису запиту через `waitUntil`: upsert `requests + 1`. Помилка тут ніколи не ламає публікацію.
- Профілі не рахуємо: сигнал попиту — саме запити замовників.
- Прибирання: терміни з `requests = 1`, старші 30 днів, видаляються (там і осідають імена й випадкові слова).

**Готово, коли:** тест `unknownTerms` на прикладах («потрібен бот для барбершопу з оплатою через LiqPay» → є незнайомі слова, немає стоп-слів і розпізнаних тегів); події з'являються в локальній `events` після роботи з пікером.

### 3.3 Звіт і як поповнювати словник

**Залежить від:** 2.6, 3.2. **Розмір:** S.

**Звіт:** `npm run tel -- tags --env production --days 30` друкує markdown і кладе копію в `.cache/tags-report-<дата>.md`:

1. Пропозиції зі статусом `new`: текст, скільки людей, у яких контекстах.
2. Порожні пошуки: запит, у скількох різних сесіях.
3. Незнайомі слова в запитах із `requests ≥ 3`.
4. Хибні спрацювання: `tag_removed` з `source = auto` за тегом і фразою.
5. Якість пошуку: середнє `rank` у `tag_picked`; запити, де вибирали з 5-го місця й нижче.

**Процедура раз на тиждень** (записати в `docs/telemetry.md`):

1. Запустити звіт.
2. Для кожного кандидата вирішити: новий тег (у `lib/tags/groups/<група>.ts`, із синонімами й супутниками), синонім наявного тегу, прибрати хибний синонім або пропустити.
3. `npm test`: `tests/unit/tags.test.ts` стежить, щоб одна фраза вела рівно до одного тегу.
4. Мерж і деплой.
5. **Лише після деплою** закрити пропозиції: `npm run tags:resolve -- --env development --phrase "webflow cms" --tag webflow`. Скрипт (`scripts/tags-resolve.ts`, генерує SQL, як `seed-dev.ts`) ставить `status` (`added` — новий тег, `mapped` — вже був), `resolved_tag_id` і додає тег усім, хто пропонував: профіль → `profile_tags` (`manual`), робота → `project_tags` (`manual`), запит → `request_tags` (з назвою). `--reject --note "…"` — відхилити. Скрипт перевіряє, що тег є в локальному словнику; що він уже задеплоєний — на тобі (інакше наступне збереження профілю викине невідомий тег).

**Готово, коли:** звіт відпрацьовує на dev-базі; `tags:resolve` на локальній базі переводить чип «на розгляді» у звичайний тег (тест на SQL-генераторі).

**Потім, з адмінкою:** список пропозицій із кнопками замість скрипта, а словник переїде в D1 (`tags`, `tag_synonyms` з plan-mvp), щоб додавати теги без деплою. Сповістити людину в Telegram «Тег „Webflow“ додано у ваш профіль» — коли буде і бот, і адмінка.

---

## Блок 4. Telegram-бот

Що вже вирішено в plan-mvp: особистий бот для сповіщень і публічний канал запитів, відгукнутися можна лише на платформі, канал — через 15–20 хв після першої хвилі запрошень. Перемикач Telegram у налаштуваннях сповіщень зараз стоїть із позначкою «Скоро» (`components/account/notification-settings.tsx`).

### 4.1 Каркас бота

**Залежить від:** токен і секрет тестового бота (розділ «Що потрібно від тебе»). **Розмір:** M.

**Файли**

- `lib/telegram/config.ts` — читає `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_CHANNEL_ID`, `SITE_URL`; `enabled` = є токен і секрет. Без них усе мовчки вимкнено, як пошта без Resend.
- `lib/telegram/api.ts` — `callTelegram<T>(method, params)`: POST JSON на `https://api.telegram.org/bot<token>/<method>`, тайм-аут 10 с (`AbortSignal.timeout`), розбір `{ ok, result, description, error_code, parameters }`. Помилка `TelegramError` з кодом: 429 → `retryAfter`, 403 → `blocked`. **У журнал ніколи не потрапляє адреса запиту: у ній токен.**
- `lib/telegram/types.ts` — мінімальні типи: Update, Message, User, Chat, CallbackQuery, ChatMemberUpdated, InlineKeyboardMarkup.
- `lib/telegram/texts.ts` — усі тексти українською, `escapeHtml`, `parse_mode: "HTML"`.
- `lib/telegram/handle-update.ts` — маршрутизація оновлень.
- `app/api/telegram/webhook/route.ts`:
  1. бот вимкнений → 404;
  2. заголовок `x-telegram-bot-api-secret-token` не збігся (порівняння за сталий час) → 401 без тіла;
  3. дублі: таблиця `telegram_updates (update_id pk, received_at)`, `INSERT OR IGNORE`; уже було → 200;
  4. одразу 200, обробка в `waitUntil`.
- Команди: `/start` без параметра — привітання й кнопка «Відкрити Vibe Map» (`SITE_URL`); `/start <токен>` — 4.2; `/help`; `/settings` і `/stop` до 4.2–4.3 відповідають «Скоро». Інший текст — коротка допомога. `my_chat_member`: бота додали адміном у канал → `logEvent` рівня `info` з id каналу (так ти дізнаєшся id тестового каналу); людина заблокувала бота → 4.2.
- `scripts/telegram-setup.ts`, команда `npm run tg:setup -- --env development --url https://uposhuku-development.uposhuku.workers.dev`. Токен і секрет бере зі змінних оточення оболонки (`TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npm run tg:setup …`) і ніде їх не друкує. Викликає:
  - `setWebhook`: `url/api/telegram/webhook`, `secret_token`, `allowed_updates: ["message", "callback_query", "my_chat_member"]`, `drop_pending_updates: true`;
  - `setMyCommands`: start «Почати», settings «Налаштування сповіщень», stop «Вимкнути сповіщення», help «Допомога» (`language_code: "uk"` і без мови);
  - `setMyDescription` і `setMyShortDescription`;
  - друкує `getWebhookInfo`.
- `env.d.ts`, `.dev.vars.example`, `wrangler.jsonc` (`TELEGRAM_BOT_USERNAME`, `SITE_URL` у `vars` кожного середовища).
- Збої API → `logEvent` `telegram_api_failed` (якщо 2.2 ще немає — `console.error` і позначка в README).

**Чернетки текстів** (поправиш на рев'ю)

- Опис (до 512): «Сповіщення Vibe Map: нові пропозиції на ваш запит, повідомлення в чаті, угоди й запити під ваші теги. Підключається на сайті: Сповіщення → Telegram.»
- Короткий опис (до 120): «Сповіщення з Vibe Map: пропозиції, повідомлення, угоди.»
- Привітання: «Привіт! Я надсилаю сповіщення з Vibe Map. Щоб підключити акаунт, відкрийте на сайті «Сповіщення» → «Telegram» → «Підключити».»

**Чому без бібліотеки.** Потрібно шість методів (`sendMessage`, `editMessageText`, `deleteMessage`, `answerCallbackQuery`, `setWebhook`, `setMyCommands`); `fetch` у воркері вистачає, залежностей нуль. grammY варто брати, якщо в боті з'являться діалоги й меню.

**Готово, коли:** тести роуту (чужий секрет → 401; той самий `update_id` обробляється раз; `/start` без параметра → `sendMessage` з привітанням, `fetch` підмінений); на dev-воркері тестовий бот відповідає на `/start`.

### 4.2 Прив'язка акаунта

**Залежить від:** 4.1. **Розмір:** M.

**Таблиці**

```ts
telegram_links:       user_id (pk, fk users cascade), chat_id (unique), username, first_name,
                      active (boolean, default true), linked_at, blocked_at
telegram_link_tokens: token_hash (pk), user_id (fk cascade), expires_at, used_at
```

**API** (`app/api/telegram/link/route.ts`, лише з сесією)

- `GET` → `{ linked, username, blocked }`.
- `POST` → одноразовий токен: 24 випадкові байти в base64url (Telegram дозволяє в `start` до 64 символів `A-Za-z0-9_-`), у базі лише SHA-256, живе 15 хв, попередні невикористані токени людини гаснуть. Відповідь `{ url: "https://t.me/<bot>?start=<токен>" }`.
- `DELETE` → `active = false`, бот пише «Сповіщення вимкнено. Підключити знову можна на сайті».

**Бот**

- `/start <токен>`: токен дійсний і невикористаний → позначити використаним → upsert `telegram_links`. Якщо цей Telegram уже був прив'язаний до іншого акаунта — стару прив'язку видалити (один Telegram ↔ один акаунт) і сказати «Попередній акаунт від цього Telegram відключено» (без пошти). Відповідь: що буде приходити + кнопки «Налаштування» і «Відкрити Vibe Map». Далі `pushUser(userId, { t: "telegram" })` — сайт оновлює стан без перезавантаження; `trackServer("telegram_linked")`.
- Токен застарів чи використаний: «Посилання застаріло. Натисніть «Підключити» на сайті ще раз».
- `/stop` → `active = false`. `my_chat_member` зі статусом `kicked` (людина заблокувала бота) → `active = false`, `blocked_at`.
- `RealtimeEvent` (`lib/realtime/types.ts`) отримує `{ t: "telegram" }`.

**Інтерфейс** (рядок Telegram у `components/account/notification-settings.tsx`)

- Не підключено: «Підключити» → POST → `window.open(url, "_blank")` (на телефоні відкриється застосунок Telegram) → «Чекаємо підтвердження в Telegram…» і «Скасувати». Слухаємо подію `telegram` у сокеті, запасний шлях — GET раз на 4 с до 3 хв.
- Підключено: «@username» і «Відключити».
- Заблоковано: «Бот заблоковано в Telegram. Підключіть ще раз».

**Готово, коли:** тести (токен одноразовий і з терміном; повторна прив'язка переносить чат; `kicked` вимикає); на dev-воркері повний цикл «Підключити → Telegram → Start → на сайті @username».

### 4.3 Налаштування сповіщень на сервері

**Навіщо.** Зараз вибір живе лише в localStorage (`lib/notifications.ts`, ключ `vm:notifications`), і сервер не знає, чи можна писати людині.

**Залежить від:** нічого. **Розмір:** M.

1. Таблиця `notification_preferences (user_id pk fk cascade, prefs text json, updated_at)`. Форма й значення за замовчуванням в одному спільному файлі `lib/notifications/prefs.ts` (zod):
   ```ts
   {
     channels: { email: true, push: false, telegram: true },  // telegram діє лише з прив'язкою
     kinds: { offers: true, messages: true, deals: true, matching: true, tags: true },
     quietHours: true                                          // 23:00–08:00 за Києвом без звуку
   }
   ```
2. `GET` і `PUT /api/notifications/preferences` (лише з сесією). Гість лишається на localStorage.
3. Клієнт: після входу — GET; якщо на сервері рядка ще немає, а в localStorage є вибір — один раз PUT (перенесення). `setPrefs` оновлює стан одразу і з затримкою 500 мс шле PUT; localStorage лишається кешем.
4. Інтерфейс: розділ «Про що повідомляти» з п'ятьма перемикачами (shadcn Switch → `components/ui/switch.tsx`): нові пропозиції, повідомлення, угоди, запити під мої теги, теги з моїх пропозицій.

**Готово, коли:** тести репозиторію (значення за замовчуванням, злиття часткового PUT) і роуту (валідація); вибір переживає вхід з іншого браузера.

### 4.4 Сповіщення в Telegram

**Залежить від:** 4.2, 4.3. **Розмір:** L.

**Диспетчер** `lib/server/notify.ts`: `notifyLater(userId, { kind, key, html, url, button })`, усе в `waitUntil`:

1. Налаштування й прив'язка: немає активної прив'язки, вимкнений канал telegram або цей вид → нічого.
2. `messages` і `offers` не шлемо, якщо людина зараз на сайті (`isOnline` з `lib/server/presence-repo.ts`). Угоди, запити під теги й теги шлемо завжди.
3. Дублі й частота: таблиця `notification_log (key pk, user_id, kind, created_at)`, `INSERT OR IGNORE`; ключ уже був → не шлемо. Ключі: `msg:<conversationId>:<10-хв кошик>`, `offer:<requestId>:<10-хв кошик>`, `deal:<dealId>:<стан>`, `match:<requestId>:<userId>`. Запитів під теги — не більше 10 на людину за добу.
4. 23:00–08:00 за Києвом (`Intl.DateTimeFormat` з `timeZone: "Europe/Kyiv"`) і `quietHours` → `disable_notification: true`.
5. `sendMessage`: 403 → прив'язка `active = false`; 429 → одна повторна спроба, якщо `retry_after` до 5 с, інакше пропуск і запис у журнал.
6. Помилки → `logEvent` `telegram_send_failed`.

**Де викликати** (поруч з наявними `pushUser`)

| Подія | Файл | Кому | Текст (чернетка) | Кнопка |
| --- | --- | --- | --- | --- |
| Нова пропозиція | `app/api/feed/[id]/response/route.ts` | автор запиту | «Нова пропозиція на ваш запит «{60 символів}»: {ціна} ₴, {термін}» | «Переглянути» → `/?open=offers:<requestId>` |
| Нове повідомлення | `app/api/conversations/[id]/messages/route.ts`, `app/api/conversations/route.ts` | співрозмовник | «{Ім'я}: {100 символів}» | «Відповісти» → `/?open=chat:<conversationId>` |
| Угода | `app/api/deals/route.ts`, `app/api/deals/[id]/route.ts` | інша сторона | «Угода: {стан людською мовою}» | «Відкрити» → чат угоди |
| Запит під теги | `app/api/requests/route.ts` (POST) | опубліковані виконавці з `matchScore ≥ MATCH_THRESHOLD`, крім автора, до 30 найкращих | «Новий запит під ваші теги: {60 символів без контактів}. {бюджет} · {місто чи «Віддалено»}» | «Подивитися» → `/?open=request:<id>` |

Це і є «перша хвиля запрошень» з plan-mvp; канал (4.5) іде через 20 хв після неї.

**Глибокі посилання.** `<DeepLinkSync/>` у `app/(map)/layout.tsx` читає `?open=offers:…|chat:…|request:…` після завантаження, відкриває потрібну панель через наявні стори (`lib/requests/side-panel.ts`, `lib/requests/direct-chat.ts`, стрічка й картка запиту), прибирає параметр (`history.replaceState`). Гостя спершу веде у вхід, потім відкриває. Усі посилання з бота мають `utm_source=telegram&utm_medium=bot`, з каналу — `utm_medium=channel`, щоб аналітика бачила, звідки прийшли.

**Готово, коли:** тести диспетчера з підміненим `fetch` і D1 (вимкнено в налаштуваннях → не шле; онлайн → не шле повідомлення; удруге за 10 хв → не шле; тихі години → без звуку; 403 → прив'язка вимкнена); на dev-воркері двома акаунтами: перший офлайн, другий пише → у Telegram приходить повідомлення → кнопка відкриває саме цю розмову.

### 4.5 Публічний канал запитів

**Залежить від:** 4.1, 4.4 (глибоке посилання на запит); тестовий канал із ботом-адміном. **Розмір:** L.

1. **Схема:** `requests.channel_opt_in` (boolean, default true); таблиця `channel_posts (request_id pk fk cascade, chat_id, message_id, status: posted | closed | failed, posted_at, updated_at, error)`.
2. **Поле запиту** (`components/composer/request-params.tsx`): перемикач «Показати в Telegram-каналі» з підказкою «Без ваших контактів. Відгукнутися можна лише тут». Значення йде з запитом і перевіряється на сервері.
3. **`lib/telegram/channel.ts`**
   - `stripContacts(text)` у `lib/chat/contacts.ts` поруч із `mentionsContacts`: телефони, пошта, @ніки, посилання (t.me, wa.me, viber, будь-які http) → «[контакт приховано]».
   - `formatChannelPost(request)`: до 4 хештегів із назв тегів (нижній регістр, пробіли й дефіси → `_`, лише літери, цифри, `_`); текст через `stripContacts`, до 400 символів по межі слова з «…»; рядок «💰 {бюджет} · 📍 {місто чи «Віддалено»} · ⏱ {термін}» лише з наявних полів; кнопка «Відгукнутися на Vibe Map» → `${SITE_URL}/?open=request:<id>&utm_source=telegram&utm_medium=channel`.
   - `postDueRequests(now)`: відкриті запити з `channel_opt_in`, створені між `now − 24 год` і `now − CHANNEL_DELAY_MIN`, без рядка в `channel_posts`; до 10 за запуск (ліміт Telegram для каналу — 20 повідомлень на хвилину); не більше 3 постів від однієї людини за добу. Помилка → рядок `failed` з текстом, без повторів.
   - `closeFinishedPosts()`: пости `posted`, чий запит закритий чи видалений → `editMessageText` з «✅ Виконавця знайдено» або «Запит закрито» і без кнопки; статус `closed`; до 10 за запуск.
4. **Cron.** `wrangler.jsonc`, у кожному середовищі `"triggers": { "crons": ["*/5 * * * *"] }`. `worker/index.ts` отримує `scheduled(controller, env, ctx)`, який через `ctx.waitUntil` викликає `openNext.fetch` на `${SITE_URL}/api/internal/tick` з `Authorization: Bearer <INTERNAL_TOKEN>` — як `worker.js` в ukoshiku (лише в роуті Next є контекст бази). `app/api/internal/tick/route.ts` перевіряє токен за сталий час і запускає `postDueRequests` і `closeFinishedPosts`. Сюди ж потім прибирання: `notification_log`, `telegram_updates`, прострочені токени прив'язки.
5. **Змінні:** `CHANNEL_ENABLED` (`"1"` — увімкнено; на проді вимкнено, доки ти не ввімкнеш), `CHANNEL_DELAY_MIN` (20; на dev можна 1 для перевірки), `TELEGRAM_CHANNEL_ID`, секрет `INTERNAL_TOKEN`.
6. **Право:** `lib/legal/*` (умови й політика): запит без контактів може бути опублікований у нашому Telegram-каналі, якщо не вимкнено галочку.

**Готово, коли:** тести (`stripContacts` на телефонах, пошті, @ніках і посиланнях; `formatChannelPost` — хештеги й довжина; `postDueRequests` бере лише дозрілі й незапощені, удруге нічого не постить, тримає ліміт на людину); на dev: запит із галочкою → через `CHANNEL_DELAY_MIN` пост у тестовому каналі; запит із телефоном у тексті → телефону в пості немає; закрив запит → пост відредаговано.

---

## Блок 5. Один kit на кілька проєктів

### 5.1 Винести kit у `web-kit`

**Залежить від:** 2.1–2.5 (API kit тиждень не мінявся); порожній приватний репозиторій `web-kit` від тебе. **Розмір:** S.

1. `git remote add web-kit git@github.com:todorowMax/web-kit.git`.
2. `git subtree split --prefix=kit --rejoin -b kit-split` і `git push web-kit kit-split:main`. `--rejoin` додає в uposhuku коміт-з'єднання, після якого `pull` і `push` знаходять спільну історію.
3. `package.json`: `"kit:pull": "git subtree pull --prefix=kit web-kit main -m \"kit: оновлення з web-kit\""`, `"kit:push": "git subtree push --prefix=kit web-kit main"`. Без `--squash`: змішування режимів ламає subtree.
4. **Спершу на копії репозиторію.** Якщо `kit:pull` скаржиться на unrelated histories, запасний шлях: `git rm -r kit`, коміт, `git subtree add --prefix=kit web-kit main` (історія kit лишиться у `web-kit`).
5. `kit/README.md` остаточно: як підключити до нового проєкту (subtree add → D1 → `migrations_dir` → `env.d.ts` → два роути → `<Telemetry/>` → словник подій → тест межі), як оновлювати, правила (core без React і Next; жодних імпортів застосунку; кожна зміна API — запис у CHANGELOG і нова VERSION).
6. **Правило команди:** правки в `kit/` ідуть звичайним PR в uposhuku (Богдану доступ до `web-kit` не потрібен); у `web-kit` їх відправляє лише Макс (`npm run kit:push` після мержу).

**Готово, коли:** у `web-kit` лежить історія kit; у свіжому клоні uposhuku `npm run kit:pull` каже «Already up to date».

### 5.2 Підключити kit до ukoshiku

**Залежить від:** 5.1. **Розмір:** M. Окремий репозиторій і PR.

1. `git subtree add --prefix=kit web-kit main`.
2. D1 `ukoshiku-telemetry-<env>` для development, staging і production, привʼязка `TELEMETRY_DB`.
3. `lib/logging/log.ts` стає тонкою обгорткою над kit `logEvent` з тією самою сигнатурою — 31 виклик `logEvent(` не міняється. `lib/logging/client.ts` і `components/error-reporter.tsx` → з kit.
4. Аналітика: `lib/analytics/amplitude.ts` реалізує інтерфейс провайдера kit (ті самі 4 методи) і працює поруч зі своїм провайдером, тож події є і в Amplitude, і в `TELEMETRY_DB` (для модераційної консолі). Ключ згоди лишити `mealcart_analytics_consent`, щоб не перепитувати людей.
5. Стара таблиця `logs` у головній базі: перестаємо писати; через 30 днів міграція її видаляє.
6. `LOGGING.md` і `ANALYTICS.md`: запити переводимо на `TELEMETRY_DB`.

---

## Що потім знадобиться адмінці (зараз не робимо)

Адмінка за схемою з plan-mvp: окремий репозиторій, ходить в API лише зі свого сервера з `Authorization: Bearer`. Ендпоінти живуть в uposhuku:

- `GET /api/admin/telemetry/issues`, `GET /api/admin/telemetry/issues/:fingerprint`, `PATCH …` (статус).
- `GET /api/admin/analytics/summary?days=`, `GET /api/admin/analytics/funnels/:name` — ті самі запити, що в `npm run tel`.
- `GET /api/admin/tags/report`, `GET /api/admin/tags/proposals`, `PATCH /api/admin/tags/proposals/:id` (замість `tags:resolve`).
- `GET /api/admin/telegram/channel-posts`, `DELETE …` (зняти пост).
- Коли подій стане понад ~1 млн рядків — таблиця денних підсумків `events_daily`, щоб адмінка не рахувала все щоразу.

## Ризики

- **Ліміти D1.** Кожна подія — рядок плюс три індекси. На безкоштовному плані Cloudflare денний ліміт записаних рядків невеликий (перевір у дашборді, на якому плані акаунт). Якщо впремося: рідше слати `page_view` або перенести події у Workers Analytics Engine — інтерфейс kit від цього не зміниться.
- **Недорахунок.** Блокувальники й відмови від згоди з'їдають частину клієнтських подій; ключові кроки страхує `trackServer`.
- **Спам у публічному каналі.** Ліміт 3 на людину, вирізання контактів, вимикач `CHANNEL_ENABLED`; видалення постів — з адмінкою.
- **Витік токена бота.** Токен лише в секретах; адреса Bot API не логується; у разі витоку — `/revoke` у @BotFather і новий секрет.
- **Зловживання тегами.** Ліміти й перерахунок тегів на сервері (1.2).
- **`onRequestError` під OpenNext** може не викликатися — перевіряємо в 2.2, запасний шлях описаний.
