# Бриф A: настоящая оплата размещения через Monobank

Задача: [../2026-11-03-prelaunch-ux-review.md](../2026-11-03-prelaunch-ux-review.md), пакет A (C-2, B-17).
Решение владельца 03.11: размещение на карте оплачивается по-настоящему, обычным счётом Monobank (без холда и сплита).

## Сейчас

- `components/placement/placement-panel.tsx`: «Monobank · тестовий режим», «Оплатити (тест)», «Імітувати відмову банку»,
  «Квитанції надійдуть на пошту, коли підключимо Monobank».
- `app/api/placement/route.ts` POST `{amount, simulate?}` сразу вызывает `addPayment` (`lib/server/placement-repo.ts`) —
  платёж засчитывается без денег.
- Клиент банка уже есть: `lib/monobank/client.ts` (`createInvoice`, `getInvoiceStatus`, токен из `MONOBANK_TOKEN`),
  подпись вебхука: `lib/monobank/webhook.ts` (`verifyWebhookSignature(rawBody, xSign)`). Таблица засчитанных оплат: `payments` в `db/schema.ts`.

## Сделать

1. **БД.** Новая таблица `placement_invoices` в `db/schema-payments.ts`: `id` (наш, `pin_…`), `userId` → users,
   `invoiceId` (уникальный), `amount` (₴, целое), `status` (статус банка), `modifiedDate` (строка банка, для порядка событий),
   `createdAt`, `updatedAt`. Миграция через `npm run db:generate` (проверь имя скрипта в package.json), только добавление.
2. **Клиент.** В `createInvoice` позиция корзины без сплита: `splitReceiverId` необязателен для этого вызова
   (отдельный тип позиции `{name, qty, sum, code, splitReceiverId?}`; тип `BasketItem` из `lib/deals/basket.ts` не ломать).
3. **Репозиторий** (`lib/server/placement-repo.ts` или новый `lib/server/placement-invoice-repo.ts`):
   - `createPlacementInvoice({userId, amount, invoiceId}, now)`;
   - `applyInvoiceStatus(status: InvoiceStatusResponse, now)` — находит запись по `invoiceId`; игнорирует событие,
     если `modifiedDate` не новее сохранённого; обновляет статус; при `success` засчитывает оплату **ровно один раз**:
     вставка в `payments` с детерминированным id `pay_mono_<invoiceId>` и `onConflictDoNothing`, `tierAfter` как в `addPayment`.
     Возвращает `{credited: boolean, userId}` или `null`, если счёт не наш.
   - `getPlacementInvoice(id, userId)`.
   - `addPayment` убрать, если больше не используется (проверь `grep`; сид-скрипт `scripts/seed-dev.ts` может его использовать —
     тогда оставить).
4. **POST /api/placement** `{amount}`: валидация как сейчас; путь `simulate` удалить целиком. Если `MONOBANK_TOKEN` не задан
   (`readVar`), ответить `problem(503, "Оплата тимчасово недоступна", …)`. Иначе: `createInvoice({amount: amount*100,
   hold: false, reference: <наш id>, destination: "Розміщення на карті Findlyfy", webHookUrl: <origin>/api/monobank/webhook,
   redirectUrl: <origin>/?placement=<наш id>, basketOrder: [одна позиция code "placement", name "Розміщення на карті Findlyfy, N ₴", qty 1, sum amount*100]})`,
   сохранить счёт, вернуть `{id, pageUrl}` со статусом 201. `origin` = `new URL(request.url).origin`.
   Ошибку `MonobankError` → `problem(502, "Банк не відповів", …)` без текста банка в ответе; в лог — да.
5. **GET /api/placement/invoices/[id]** (только владелец): если статус не финальный (`created`/`processing`), сверить через
   `getInvoiceStatus` и `applyInvoiceStatus` (вебхук до localhost не доходит, а на проде может опоздать). Вернуть
   `{status, placement}`. Финальные: `success`, `failure`, `expired`, `reversed`.
6. **POST /api/monobank/webhook**: сырое тело `await request.text()`, заголовок `X-Sign`; неверная подпись → 401 без деталей.
   Разобрать `invoiceStatusResponse`, вызвать `applyInvoiceStatus`. Если `credited`: `serverEvent(EVENTS.placementPaid, …)`
   и `pushGlobal({ t: "map" })` (как сейчас в POST). Ответ 200 всегда, когда подпись верна (даже если счёт не наш), иначе банк
   будет повторять. Вебхук общий: позже в него придут и счета безопасной угоды, поэтому функция-разборщик по `invoiceId`.
7. **UI** `placement-panel.tsx`: убрать «тестовий режим», «Імітувати відмову банку», «(тест)», текст про квитанции.
   Кнопка «Оплатити {сума} ₴» → POST → `window.location.assign(pageUrl)`; состояние «Переходимо до оплати…».
   По возвращении (`?placement=<id>` в URL) открыть панель (найди, кто её открывает: `account-button.tsx`, `profile-editor.tsx`),
   опросить GET из п.5 (до ~5 раз с паузой 2 с, пока не финальный), показать «Оплату зараховано» или «Оплата не пройшла,
   гроші не списано» и убрать параметр из URL (`history.replaceState`). Логику — в хук `use-placement-…ts` рядом (COMP-2),
   `fetch` только в `lib/placement/client.ts` или хуке (ARCH-5). Под кнопкой: «Оплата карткою через monobank. Після оплати
   рівень оновиться автоматично.»
8. **Тексты/документы.** `.dev.vars.example`: комментарий к `MONOBANK_TOKEN` — «термінал без розщеплення: оплата розміщення;
   на dev тестовий токен». Комментарии в `placement-repo.ts`/`route.ts` про «тестовий POST» обновить.
9. **Тесты** (`tests/unit`, D1 в памяти через `tests/helpers/d1.ts`, как `tests/unit/payments.test.ts`):
   двойной `success` засчитывает один раз; событие со старым `modifiedDate` не откатывает статус; `failure` не засчитывает;
   чужой `invoiceId` → `null`. Роут вебхука: неверная подпись → 401 (подпись можно подменить через `vi.mock`).

## Не трогать

`components/deals/**`, `components/chat/**`, `app/api/deals/**`, `app/api/conversations/**`, `lib/legal/**`, `lib/deals/**`
(кроме чтения) — это пакет B, его делают параллельно. `app/globals.css` не править (стили Tailwind в JSX; нужен класс — скажи
в отчёте). Не коммитить, не пушить, не деплоить, не запускать `wrangler secret`. Не печатать значения из `.dev.vars`.
Не проводить реальные оплаты.

## Проверки (DONE-1)

`npm run lint` (ratchet не должен вырасти: `npm run lint:ci`), `npm run typecheck`, `npm test`. В отчёте: список файлов,
что не сделано и почему, вывод проверок (итоговые строки).
