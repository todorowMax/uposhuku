# Аудит кода UI (только чтение): components/**, app/**

Дата: 2026-11-03. Метод: чтение кода, grep, `npx eslint components app -f json` (790 предупреждений; JSON лежит рядом, `eslint.json`), `globals.css`. Браузер не открывал, ничего в репозитории не менял.

## Главное (читать первым)

1. **Флаг `SAFE_DEAL_ENABLED = false` не выключает UI сделки.** Он используется только в `lib/legal/offer.ts` и `lib/legal/terms.ts` (убирает раздел из текстов). В `components/` и `app/api` его нет (grep). Заказчик в чате видит «Безопасная сделка / Рекомендуем» и кнопки «Заморозить … (тест)», при том что в оферте о ней ни слова. Бриф исходит из того, что флаг скрывает UI, а это неверно: C-1.
2. **Оплата размещения на карте работает как симуляция.** Чтобы появиться на карте (на карте только tier >= 2), исполнитель проходит панель «Оплатити (тест)» с текстом «Справжня оплата ще не підключена». `POST /api/placement` без проверки среды сам «зачисляет» платёж: C-2.
3. **«ФОП» вычисляется хешем от id исполнителя** (`lib/deals/fop.ts`), поэтому у ~1/3 реальных исполнителей в UI сделки написано «Недоступна: виконавець не ФОП»: C-3.
4. Fake-лиц в проде нет: `lib/map/demo.ts` импортируют только `scripts/seed-dev.ts` и тесты; публикация профиля требует фото (`lib/profile/types.ts:79`); `/api/map/performers` отдаёт только реальные профили. Но README говорит обратное (C-17).

## Таблица находок

| id | P | где | что не так | предложение | правило |
|---|---|---|---|---|---|
| C-1 | P0 | `components/chat/direct-deals.tsx:206-236`, `components/deals/deal-tab.tsx:237-262, 713, 755-770, 918, 951`, `lib/legal/config.ts:40` | UI «Безпечна угода (Рекомендуємо)», «Monobank · тестовий режим», «Заморозити … (тест)», «Тестовий QR для переказу» виден всем в проде. Флаг гасит только юр. тексты. Оферта молчит о механике, которую UI рекомендует. По брифу было бы P2, но флаг в коде ничего не гасит | Прочитать флаг в UI и API (`/api/deals`, `/api/deals/[id]` action `fund`, `simulate`) и скрыть метод «safe», оставить прямой перевод. Либо решить, что деплоим как есть, и поправить тексты | CORE-7, DONE-3 |
| C-2 | P0 | `components/placement/placement-panel.tsx:176, 186, 190, 202`; `app/api/placement/route.ts:26-34`; `components/profile/profile-editor.tsx:153, 393-402` | Тестовая «оплата» размещения в обязательном пути публикации: «Monobank · тестовий режим», «Справжня оплата ще не підключена», «Оплатити (тест)», «Імітувати відмову банку», в истории «Квитанції надійдуть на пошту, коли підключимо Monobank» (`:167`). POST принимает `amount` и сразу делает `addPayment` без проверки среды: любой залогиненный повышает себе tier бесплатно. Профиль без оплаты на карте не виден | До запуска решить: бесплатный tier 2 «Старт» без панели оплаты, либо реальный Monobank. Убрать «Імітувати відмову» и `simulate` на проде, закрыть POST по `DEPLOY_ENV`. Это и UX, и деньги | CORE-7 |
| C-3 | P0 | `lib/deals/fop.ts:7-14`, использование `components/chat/direct-deals.tsx:69,206-222`, `components/deals/deal-tab.tsx` | «Чи ФОП» = `hash(id) % 3 !== 0`. Для ~33% реальных исполнителей показывается «Недоступна: виконавець не ФОП», остальным предлагается холд. Выдуманные данные в проде | Скрыть выбор метода, пока поле ФОП не заведено в профиле (см. C-1) | DONE-3 |
| C-4 | P1 | `components/account/notification-settings.tsx:130-135` | Тумблер «Пошта» с подписью «Листи на … Надсилання підключимо разом із сервером». Единственное письмо в коде — код входа (`lib/server/mail.ts` экспортирует только `sendLoginCode`). Включённая «Пошта» ничего не шлёт | Убрать строку или показать как «Скоро» без тумблера (как сделано у Telegram: `:97`) | DONE-3 |
| C-5 | P1 | `components/maplibre/maplibre-scene.tsx:1996` (+ `performer-about.tsx` onOpenWork) | Клик по работе в карточке исполнителя показывает `text-[10px]` текст «Сторінки робіт з'являться після підключення профілів.» Профили уже подключены: обещание устарело и читается как заглушка | Убрать onClick/сделать плитку не кнопкой или открыть профиль исполнителя `openProfile(id)` | DONE-3 |
| C-6 | P1 | `components/map/mode-switch.tsx:30-47`, `components/maplibre/maplibre-scene.tsx:271-277`, `components/account/account-button.tsx:213` | Терминология: «Всі розробники», «N розробників», «Стати розробником», а везде остальное «виконавець» (257 вхождений), «спеціаліст» (6, `specialist-filters.tsx:137,281`). Вторая кнопка меню зовётся «Стати на карту» / «Зʼявитися на мапі». Ещё «мапа/мапі» (13 в тексте, `legend.tsx:88,92`, `placement-panel.tsx:24,76,219,251,256`, `account-button.tsx:88`) против «карта/на карті» (59) | Один словарь: выконавець, карта (или мапа, но одно). «Розробники» заменить, `developerCount` переименовать | — |
| C-7 | P1 | 9 оверлеев: `auth-panel.tsx:202`, `placement-panel.tsx:70`, `notification-settings.tsx:112`, `profile-editor.tsx:185`, `profile-view.tsx:216`, `location-picker.tsx:155`, `inbox-panel.tsx:320,753`, `legend.tsx:69` | `role="dialog"` (7 с `aria-modal="true"`) на обычном div: есть Escape, но нет focus trap (Tab уходит на карту за панелью), в 7 из 9 нет возврата фокуса. `aria-modal` врёт. ESLint DS-5: 15 срабатываний в 12 файлах | Перевести на Radix `Dialog`/`Sheet` (в `components/ui/sheet.tsx` уже есть) | DS-5, SEM-7 |
| C-8 | P1 | `account-button.tsx:111-189` (6 menuitem), `request-composer.tsx:516,575`, `request-dock.tsx:217`; tablist: `mode-switch.tsx:29`, `inbox-panel.tsx:356-367` | `role="menu"/menuitem` и `role="tab"` без стрелочной навигации (ни одного `ArrowDown/ArrowRight` в этих файлах), без `aria-controls`/`tabpanel`. Скринридер входит в режим меню и ждёт стрелок | Radix `DropdownMenu` и `Tabs`, либо убрать роли: кнопки в списке с `aria-pressed` | SEM-9 |
| C-9 | P1 | Главная `app/(map)/page.tsx` (возвращает `null`), `app/(map)/layout.tsx:28` | На основной странице нет `<h1>`, нет skip-link, нет `nav/header` (только `<main>`). `<h1>` в коде есть лишь в профиле, правовых и админке | Визуально скрытый `h1` («Findlyfy — виконавці на карті») и skip-link к полю запроса. SEO это тоже затронет | SEM-1, SEM-2 |
| C-10 | P1 | `app/globals.css` (--ink-muted `#52717b`) × `--surface #dce7e4`; ~120 применений `text-ink-muted` с `text-[10-12px]` | Контраст вторичного текста на панелях 4.14:1 (AA для мелкого требует 4.5), на hover-blue 4.09. `text-ink-muted/75` на 10px (`maplibre-scene.tsx:2009`) около 2.7:1. Оранжевый focus-ring `--brand` на панелях 2.4:1 (нужно 3:1) | Затемнить `--ink-muted` до ~#46646e (проверить) и не использовать /75 для текста; ring делать `--brand-solid` | DS-8, DS-7 |
| C-11 | P1 | `globals.css:1205-1215` (`.auth-input` 15px), `:3343` (`.chat-input` 14px), `:5670` (`.ui-command-input` 15px) | Поля ввода с шрифтом < 16px: iOS Safari приближает страницу при фокусе (viewport без `maximum-scale`, значит зум случится). Поле запроса и `dm-input` 16px, остальные нет | Для полей `font-size: 16px` (в обёртке `Input`) | DONE-2 |
| C-12 | P1 | `globals.css:466-467` (`.tag-chip-remove` 20×20), `:585-586` (`.attachment-remove` 20×20), `:1158` (`.auth-icon-button` 30×30, 11 файлов, все «Закрити»), `request-map-card.tsx:64` и `maplibre-scene.tsx:1991` (`size-7` = 28px), `:792` `.filter-chip` 34px, `:1878` `.offers-new` 32px | Цели касания меньше WCAG 2.2 AA (24px) для 20px и заметно меньше 44px для кнопок закрытия на телефоне. В DESIGN.md минимального размера цели и минимального размера текста **нет** (grep по min/tap/target пуст), проверять не по чему | Завести токены в DESIGN.md (цель >= 40px на телефоне, текст >= 12px) и применить в `Button`/`IconButton` | DS-7, CSS-10 |
| C-13 | P1 | `components/requests/offers-panel.tsx:217-228`, `lib/requests/offers.ts:109`; `feed-panel.tsx:151-160` | Состояния: у **предложений** нет error-состояния. Если первый запрос упал (`catch {}` без сообщения), `shown` остаётся `null` и вечно крутится спиннер. После успешного пустого ответа текст «Чекаємо на перші відгуки…». Спиннеры в offers/feed без `role="status"` и подписи (в inbox есть: `:603`). У feed ошибка есть, но без «Спробувати ще» | `loading/error/retry` в хуке `useOffers`, `role="status"` на спиннерах, кнопка повтора | COMP-9, SEM-12 |
| C-14 | P1 | `components/auth/auth-panel.tsx:261-263` | Согласие «Продовжуючи, ви погоджуєтесь…» набрано `text-[11px]` и ссылки в нём 11px (юридически важный текст на самом мелком кегле) | Минимум 12-13px | DS-7 |
| C-15 | P2 | Кегли: `text-[12px]` ×52, `[13px]` ×31, `[11px]` ×24, `[10px]` ×7 (`maplibre-scene.tsx:135-137,2009`, `profile-editor.tsx:460-468`, `inbox-panel.tsx:563`); CSS `font-size: 10px` (`.offer-promoted`, `.deal-badge`, `.chat-bubble time`, `.dm-bubble time`) | Нет токенов размеров текста; 10px — слишком мелко для 50+ аудитории | Токены `text-caption` (12) и т.п. в `@theme` | TW-3, CSS-10 |
| C-16 | P2 | Нативные `<button>` — **185** в 32 файлах: `inbox-panel.tsx` 20, `deal-tab.tsx` 19, `specialist-filters.tsx` 14, `feed-panel.tsx` 13, `placement-panel.tsx` 12, `profile-editor.tsx` 12, `account-button.tsx` 10, `offers-panel.tsx` 9. Нативные `<input>`/`<textarea>`/`<select>` — **28** в 15 файлах (`feed-panel.tsx` 4, `request-composer.tsx` 3, `deal-tab.tsx` 3). Каждое — копия вида через классы `auth-primary` (21 исп., 12 файлов), `auth-secondary` (17), `auth-icon-button` (12), `auth-link` (21), `offer-primary` (12), `offer-secondary` (9), `filter-chip` (19), `tag-chip` (15) | Создать `components/ui/button.tsx` (variants: primary, secondary, ghost, link, icon, chip; sizes) и переехать по файлам по убыванию. `Field/Input/Textarea` уже есть (`ui/input.tsx`), но используют его только 3 файла + admin | DS-1, DS-2, DS-4 |
| C-17 | P2 | `README.md:107` («Дані демонстраційні (`lib/map/demo.ts`), бекенду, справжніх оплат і профілів ще немає») и комментарий `lib/map/performers.ts:64` («лишаються демо») | Устарело: бэкенд, профили, сид есть; демо идёт только в `scripts/seed-dev.ts`. Читатель репозитория подумает, что на карте фейки | Обновить README | RULES-2 |
| C-18 | P2 | `DESIGN.md` («Color») против `app/globals.css:15-30` | DESIGN.md: `--bg #b9c0ca`, `--surface #f9faf9`, `--brand #303638`, «тёмной темы нет». В коде: `--bg #03090d` (deep), `--surface #dce7e4`, `--brand #f2693c`, `themeColor #03090d`. Документ описывает другой дизайн | Привести DESIGN.md в соответствие с токенами | TW-4, RULES-2 |
| C-19 | P2 | Произвольные значения: `no-restricted-syntax` TW-3 — **190** (`deal-tab.tsx` 27, `maplibre-scene.tsx` 23, `profile-editor.tsx` 20, `profile-view.tsx` 18, `notification-settings.tsx` 16, `placement-panel.tsx` 12); hex в TSX — 66 (`bg-[#…]`, `border-[#b8c4c7]` в `maplibre-scene.tsx:1999-2005`, `google-button.tsx`, `consent-banner.tsx`); hex в `globals.css` — 207 строк, токен-файл смешан с 7057 строками feature CSS | Вынести повторяющиеся (`#b8c4c7`, `#a7bcc0`, `#427484`) в токены, при касании файла | CSS-2, TW-3 |
| C-20 | P2 | Инлайн-стили CSS-4: 35 в 17 файлах (`request-composer.tsx:484-500` ×10 `style={{ position:"absolute", top:8, left:8, width:40, height:40 }}`, `admin/disputes/[id]/page.tsx` ×5, `deal-tab.tsx:577`) | Заменить классами | CSS-4 |
| C-21 | P2 | Apostrophe: ASCII `'` в видимых строках (~10: `ui/input.tsx:63`, `direct-deals.tsx:139,159`, `inbox-panel.tsx:649,1005`, `offers-panel.tsx:228`, `deal-tab.tsx:887`, `maplibre-scene.tsx:1996`), а `ʼ` (U+02BC, как в DESIGN.md) только в 3 местах (`account-button.tsx:89`, `placement-panel.tsx:219`, `inbox-panel.tsx:779`) | Единый апостроф, лучше `ʼ` или `’` | LANG-3 |
| C-22 | P2 | Motion: `motion/react` — 68 импортов в 39 файлах (`components/icons/animated/*` + `icons/qr-code|star|scale|eraser.tsx`), новых нет (вне иконок). CSS-переходы `padding/height/max-width 680ms` (`globals.css:304-313, 755`), `width 340ms` (`:1786`); GSAP `height: 0 → auto` (`feed-panel.tsx:219`, `performer-about.tsx:37`) | Все за `prefers-reduced-motion` (проверено: у каждого файла с gsap есть guard, `@media` блоков 17). Нарушения только MOT-1/MOT-2 (layout-свойства, >300 мс) | MOT-1, MOT-2 |
| C-23 | P2 | `components/chat/inbox-panel.tsx:751-767`, `offers-panel.tsx:357` (ESLint `no-noninteractive-element-interactions`) | Просмотр фото: клик по фону закрывает, Escape и кнопка есть — ок, но нет focus trap; `article` в офферах с pointer-обработчиками hover (для подсветки на карте) без клавиатурного эквивалента (есть `onFocusCapture`, значит мелочь) | Мелкое, закрыть вместе с C-7 | SEM-5 |
| C-24 | P2 | `components/deals/deal-tab.tsx:1072-1090` | Оценка 1-5 как `role="radiogroup"` из `button role="radio"` без стрелок и roving tabindex | Использовать существующий `ui/radio-group.tsx` | SEM-9 |
| C-25 | P2 | `components/auth/auth-panel.tsx:236` | `autoFocus` в поле почты (ESLint `no-autofocus`) без комментария. Допустимо для только что открытой панели, но на телефоне поднимает клавиатуру и перекрывает карту | Добавить комментарий-обоснование | SEM-7 |
| C-26 | P2 | `components/account/notification-settings.tsx:130-170` | Пять разных типов уведомлений все с одной иконкой `Send`; тумблеры «Де» и «Про що» — нативные `input[type=checkbox]` в строке (`:41`), а не `Switch` | `ui/switch.tsx` | DS-3 |
| C-27 | P2 | `components/chat/inbox-panel.tsx`, `offers-panel.tsx:206-214` | Новые пришедшие отзывы показываются кнопкой «+N нових» без live-региона; скринридер не узнает о новых предложениях | `role="status"` рядом | SEM-12 |
| C-28 | P2 | `components/account/notification-settings.tsx:97` | «Особистий бот напише … Скоро.» — когда Telegram-бот не настроен на сервере. Честная заглушка, но «Скоро» без даты и без действия | Оставить, либо скрыть строку на проде | — |

## ESLint: топ файлов по числу предупреждений (всего 790)

| файл | всего | из них DS-2 button/input | TW-3 | DS-5 | a11y |
|---|---|---|---|---|---|
| `components/deals/deal-tab.tsx` | 65 | 19+3 | 27 | 0 | 1 |
| `components/maplibre/maplibre-scene.tsx` | 52 | 7 | 23 | 1 | 0 (2 `no-img-element`) |
| `components/profile/profile-editor.tsx` | 49 | 12+2 | 20 | 1 | 0 |
| `components/chat/inbox-panel.tsx` | 42 | 20+2 | — | 2 | 4 |
| `components/composer/request-composer.tsx` | 35 | 5+3 | 7 | 0 | 0 |
| `components/placement/placement-panel.tsx` | 33 | 12+2 | 12 | 1 | 0 |
| `components/requests/feed-panel.tsx` | 32 | 13+4 | 9 | 0 | 0 |
| `components/account/notification-settings.tsx` | 31 | 4+1 | 16 | 1 | 0 |
| `components/requests/offers-panel.tsx` | 30 | 9 | 10 | 0 | 2 |
| `components/profile/profile-view.tsx` | 27 | — | 18 | 1 | 0 |

Всего по правилам: `no-restricted-syntax` 459 (DS-2 button 185, TW-3 190, CSS-4 35, DS-2 input 28, DS-5 15, ARCH-5 6), `func-style` 161, `no-restricted-imports` (motion) 68, `react-hooks/*` 36, `jsx-a11y/*` 12 (всего в 6 файлах: `inbox-panel` 4, `admin/disputes/[id]/page.tsx` 2 — ложные `aria-role` на пропе `role` у `PartyCard`, `offers-panel` 2, `chat-log` 1 — прокручиваемый лог с `tabIndex=0`, допустимо, `auth-panel` 1 autoFocus, `deal-tab` 1). Иконки-кнопки без имени: скрипт по всем `<button>` нашёл 0 без `aria-label`/текста. Поля без метки: 0 (композер `request` и `inbox-input` связаны с `sr-only` label).

## Состояния панелей

| панель | загрузка | пусто | ошибка |
|---|---|---|---|
| Стрічка запитів `feed-panel.tsx` | спиннер без `role=status` | «Поки немає запитів під ваші теги… Додайте теги» (хорошо, с действием) | `role=alert`, без повтора |
| Пропозиції `offers-panel.tsx` | спиннер без `role=status`; при сбое первого запроса бесконечный | «Чекаємо на перші відгуки…» (ок) | **нет** (C-13) |
| Inbox `inbox-panel.tsx` | `role=status` «Завантажуємо переписку/замовлення» | есть | офлайн-плашка `:649`, ошибки отправки |
| Профиль `profile-view.tsx` | `failed`-ветка есть | «Виконавець ще не додав опис і роботи», «Відгуків поки немає» | `failed` |
| Угода `deal-tab.tsx` | `busy` на кнопках | — | `role=alert` на каждом действии |

## Недостающие примитивы (в `components/ui` сейчас: alert-dialog, command, input(+Textarea,Field), popover, radio-group, select, sheet)

| примитив | сколько копий | где |
|---|---|---|
| **Button** (primary/secondary/ghost/link/icon/chip) | 185 нативных `<button>` и 8 семейств CSS-классов | везде, см. C-16 |
| **Dialog / Drawer** (адаптивный) | 9 ручных `role=dialog` + фото-вьюер | C-7; `sheet.tsx` есть, но используется только в `tag-picker` |
| **DropdownMenu** | 3 ручных `role=menu` (account-button 6 пунктов, request-composer, request-dock) | C-8 |
| **Tabs / SegmentedControl** | 2 `role=tablist` (mode-switch, inbox-filters) + `filter-chip` (19 исп.) | C-8 |
| **Switch / Checkbox** | нативные `checkbox`: notification-settings, specialist-filters:334, feed-panel:426, deal-tab:431, placement:181 (+ `request-params.tsx:84 role=switch`, `.filter-switch` в CSS) | C-26 |
| **Chip / Badge** | `tag-chip` (15), `filter-chip` (19), `deal-chip`, `deal-badge` — разный CSS | — |
| **Tooltip** | нет; 42 атрибута `title=` как замена (на телефоне не работают) | — |
| **IconButton с ≥40px целью** | `auth-icon-button` 30px, `size-7` | C-12 |
| **Skeleton / Spinner с `role=status`** | 27 `animate-spin` без обёртки | C-13 |

## Не проверено

- Браузер, 375 px, клавиатурный проход, видимое кольцо фокуса: код читал, страницы не открывал. Фокус в большинстве кнопок (`.auth-primary`, `.offer-primary`) не имеет собственного `:focus-visible` (их всего ~21 правило на 7000 строк CSS), а `outline:none` не стоит, то есть работает UA-кольцо; как оно выглядит на оранжевой кнопке, не смотрел.
- Доступность самой карты (MapLibre canvas): можно ли с клавиатуры выбрать исполнителя и есть ли списочная альтернатива; читал только DOM-обвязку.
- Копия: просмотрены строки через grep по словарю и по маркерам заглушек, а не построчное чтение всех ~250 текстов; Ukrainian-ошибок и русизмов не нашёл (единственное «заказы» — в комментарии `inbox-panel.tsx:822`), но орфографию в `lib/legal/*`, `lib/tags/*` и API-ответах не проверял.
- `app/error.tsx`, `global-error.tsx`, 404, мета-теги, OG, robots/sitemap — зона аудитора №3.
- `/admin/*`: страницы только по ESLint.
- Контраст считал по токенам из `globals.css`, а не по готовому скриншоту (стеклянные панели `glass` могут сдвигать значения).
- Реальные ответы `/api/*` и то, как вообще включён `MAIL_MODE` в проде (по `wrangler.jsonc` прод — Resend; мок-тексты входа показываются только при `mock=true`).
