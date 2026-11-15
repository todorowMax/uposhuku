# Документи фіч

Опис того, як працює кожна фіча: модель даних, правила, змінні, обмеження. Це довідка для того, хто змінює код фічі; плани й історія рішень лежать у [../tasks/README.md](../tasks/README.md). Кожна фіча має короткий файл правила в `.claude/rules/features/<фіча>.md` з `paths:`: він вантажиться в сесію агента лише тоді, коли чіпають код цієї фічі, і посилається сюди. Карта «фіча → документ → код» також у `AGENTS.md`.

| Фіча | Документ | Правило для агента | Про що |
| --- | --- | --- | --- |
| Чат | [chat.md](chat.md) | `.claude/rules/features/chat.md` | Розмови, повідомлення, фото, опитування, сокети, сповіщення |
| Запити | [requests.md](requests.md) | `.claude/rules/features/requests.md` | Правка, відновлення закритого, пин без міста |
| Угоди й оплата | [deals-payments.md](deals-payments.md) | `.claude/rules/features/deals-payments.md` | Безпечна угода (Monobank), крипта й ескроу, допомога у спорах, «перевірена угода» |
| Згоди | [legal-consents.md](legal-consents.md) | `.claude/rules/features/legal-consents.md` | Версії документів, ворота `legal_reaccept_required` і `risk_ack_required` |
| Видалення акаунта | [account-deletion.md](account-deletion.md) | `.claude/rules/features/account-deletion.md` | «Могила», блокери, виписка даних, строк зберігання |
| Телефон | [phone.md](phone.md) | `.claude/rules/features/phone.md` | Підтвердження через Telegram-бота, хеш і маска, ворота `phone_required` |
| Telegram | [telegram.md](telegram.md) | `.claude/rules/features/telegram.md` | Перепривʼязка чату, оновлення бота; про налаштування бота ще [../telegram-bot.md](../telegram-bot.md) |
| Захист | [security.md](security.md) | `.claude/rules/features/security.md` | CSP, ліміти частоти, Turnstile, формат id, TOTP модератора |
| Сторінки для пошуку | [seo.md](seo.md) | нема (файл правила не заведено) | Профіль на сервері, каталог `/poslugy`, JSON-LD, sitemap, поріг індексації |
| Прапорці | [feature-flags.md](feature-flags.md) | `.claude/rules/features/feature-flags.md` | Режими `off` / `allowlist` / `on`, порядок значень, способи оплати виконавця |

## Як вести

- Змінили поведінку фічі: виправте її документ у тому ж PR (правило RULES-2). Правило в `.claude/rules/features/` тримайте коротким: указівник і те, що не можна ламати.
- Нова фіча: документ тут, файл правила з `paths:` за зразком наявних, рядок у цьому індексі й у карті фіч у `AGENTS.md`.
- Мова документів фіч українська; правила в `.claude/rules` англійською.
