# Документи проєкту

Індекс того, що лежить у `docs/`. Правила кодингу: [AGENTS.md](../AGENTS.md), візуальні правила: [DESIGN.md](../DESIGN.md), що це за продукт: [PRODUCT.md](../PRODUCT.md). Статус тут один із: **актуально** (за цим працюємо), **у роботі**, **довідка** (джерело фактів, не план), **архів** (історія, код пішов далі). Статус задач веде [tasks/README.md](tasks/README.md), тут він лише повторений.

## Задачі

Кожна задача: документ із метою, пунктами, доказами й підсумком, поруч папка з брифами й скриншотами. Правила в [tasks/README.md](tasks/README.md).

| Задача | Статус |
| --- | --- |
| [Next.js 15 до 16](tasks/2026-10-24-next16-upgrade.md) | частково |
| [Monobank: холд, сплит, фіналізація, повернення](tasks/2026-10-26-monobank-split-integration.md) | у роботі |
| [UX/UI-ревью перед запуском](tasks/2026-11-03-prelaunch-ux-review.md) | у роботі |
| [Способи оплати до запуску](tasks/2026-11-04-payments-launch-plan.md) ([брифи](tasks/2026-11-04-payments-launch-plan/briefs.md)) | частково |
| [Роздільні способи оплати, перевірена угода, допомога в спорах](tasks/2026-11-06-payment-methods.md) | частково |
| [Єдина логіка вікон на телефоні](tasks/2026-11-06-mobile-layers.md) | частково |
| [Правова позиція без юриста: тексти, захист у коді](tasks/2026-11-13-legal-hardening.md) ([брифи](tasks/2026-11-13-legal-hardening/briefs.md)) | у роботі |

## Дослідження

| Документ | Про що | Статус |
| --- | --- | --- |
| [tasks/…/research-law.md](tasks/2026-11-13-legal-hardening/research-law.md) | Закон України: платіжні послуги, крипта, податки, персональні дані | довідка |
| [tasks/…/research-platforms.md](tasks/2026-11-13-legal-hardening/research-platforms.md) | Документи схожих платформ і проєкти положень | довідка |
| [tasks/…/research-crypto-foreign.md](tasks/2026-11-13-legal-hardening/research-crypto-foreign.md) | PayPal, Wise, Tether, WalletConnect | довідка |
| [tasks/…/research-tax-platforms.md](tasks/2026-11-13-legal-hardening/research-tax-platforms.md) | Податки й закон про цифрові платформи | довідка |
| [tasks/…/risk-register.md](tasks/2026-11-13-legal-hardening/risk-register.md) | Реєстр ризиків і рішення без юриста | актуально |
| [competitors-payment-providers.md](competitors-payment-providers.md) | Конкуренти й їхні платіжні провайдери | довідка |
| [freelancehunt-benchmark.md](freelancehunt-benchmark.md) | Що в Freelancehunt і що взяти | довідка |
| [uapay-research.md](uapay-research.md) | UAPAY: що відомо | довідка |
| [telemetry.md](telemetry.md) | Телеметрія: помилки, аналітика, словник тегів | актуально |
| [telegram-bot.md](telegram-bot.md) | Як увімкнути Telegram-бота, що з приватністю | актуально |
| [monobank-call-cheatsheet.md](monobank-call-cheatsheet.md) | Шпаргалка до розмови з Monobank | довідка |

## Плани

| Документ | Статус |
| --- | --- |
| [plan-mvp.md](plan-mvp.md) | архів (актуальне: AGENTS.md, DESIGN.md, tasks) |
| [plan-chat-mobile.md](plan-chat-mobile.md) | архів |
| [plan-tags-telemetry-telegram.md](plan-tags-telemetry-telegram.md) | архів (блок 5 чекає на `web-kit`) |
| [ui-questions.md](ui-questions.md) | архів |
| [legal-drafts-safe-deal.md](legal-drafts-safe-deal.md) | архів (текст оферти тепер у `lib/legal/safe-deal-offer.ts`) |
| [tasks/…/owner-checklist.md](tasks/2026-11-13-legal-hardening/owner-checklist.md) | актуально (що лишається власнику) |

## Листи й повідомлення назовні

Чернетки для відправки власником. Чи відправлено і що відповіли, цей індекс не відстежує: відповіді вносяться в сам файл.

| Документ | Кому |
| --- | --- |
| [monobank-questions.md](monobank-questions.md) | Monobank: питання про еквайринг |
| [monobank-letter-split.md](monobank-letter-split.md) | Monobank: розщеплення платежу |
| [monobank-message-mono-only.md](monobank-message-mono-only.md) | Monobank: виконавці лише з рахунком у mono |
| [uapay-manager-message.md](uapay-manager-message.md) | Менеджеру UAPAY |
