// lib/tags/groups/integration.ts — з чим продукт інтегрується.
import { tag } from "../types";

const t = tag("integration");

export const INTEGRATION_TAGS = [
  // Доставка
  t("nova-poshta", "Нова Пошта", ["новая почта", "novaposhta", "нову пошту", "новою поштою", "api нової пошти", "накладна нова пошта", "відділення нової пошти", "поштомат нова пошта", "новапошта"]),
  t("ukrposhta", "Укрпошта", ["укрпочта", "укр пошта", "відправити укрпоштою", "відділення укрпошти", "трекінг укрпошта"]),
  t("meest", "Meest", ["міст експрес", "meest express", "мист экспресс", "міст пошта", "meest пошта", "відправлення meest", "посилка міст експрес", "номер відстеження meest", "мист"]),
  t("rozetka-delivery", "Rozetka Delivery", ["розетка делівері", "доставка розетка", "доставка від розетки", "розетка доставка", "отримання в точці видачі розетка", "відправлення rozetka delivery", "rozetkadelivery", "розеткадоставка", "rozetka-доставка"]),
  t("glovo", "Glovo / Bolt Food", ["глово", "bolt food", "болт фуд", "замовлення glovo", "доставка глово", "кур'єр glovo", "bolt food доставка", "підключити ресторан до glovo", "boltfood"]),

  // Платежі
  t("monobank", "Monobank", ["монобанк", "mono", "моно", "monobank api", "еквайринг моно", "plata by mono", "mono checkout", "monobank еквайринг", "платіжний віджет mono", "monobank webhook", "оплата через моно"]),
  t("privatbank", "ПриватБанк", ["приват", "приват24", "privat24", "приватбанк api", "оплата через приват24", "еквайринг приватбанку", "приват24 бізнес", "платіж приватбанк"]),
  t("liqpay", "LiqPay", ["лікпей", "ликпей", "liq pay", "liqpay checkout", "платіжний модуль liqpay", "оплата через лікпей", "інтеграція liqpay", "liqpay api", "оплата картой на украинском сайте", "подключить оплату картой"]),
  t("wayforpay", "WayForPay", ["вейфорпей", "way for pay", "wayforpay checkout", "оплата через wayforpay", "платіжний модуль wayforpay", "wayforpay api", "інтеграція вейфорпей", "вайфорпей"]),
  t("fondy", "Fondy", ["фонди платежі", "fondy checkout", "платіжний шлюз fondy", "оплата через fondy", "fondy api", "інтеграція фонді", "фонді"]),
  t("portmone", "Portmone", ["портмоне", "portmone checkout", "оплата через portmone", "платіжний шлюз portmone", "portmone api", "інтеграція портмоне", "портмонэ"]),
  t("stripe", "Stripe", ["страйп", "stripe checkout", "stripe payments", "оплата через stripe", "stripe api", "stripe webhook", "стрип"]),
  t("paypal", "PayPal", ["пейпал", "пэйпал", "paypal checkout", "оплата через paypal", "paypal api", "paypal webhook", "інтеграція пейпал"]),
  t("apple-google-pay", "Apple Pay / Google Pay", ["apple pay", "google pay", "епл пей", "гугл пей", "оплата apple pay", "оплата google pay", "гаманці apple google", "платіж apple pay", "платіж google pay", "applepay", "googlepay", "еплпей", "гуглпей"]),
  t("crypto-payments", "Оплата криптою", ["оплата криптой", "usdt", "binance pay", "криптооплата", "платіж usdt", "приймати криптовалюту", "криптоплатежі", "оплата в біткоїнах"], { related: { crypto: 0.6 } }),

  // Фіскалізація й облік
  t("checkbox", "Checkbox (ПРРО)", ["чекбокс", "прро", "прро checkbox", "рро", "фіскалізація", "фискализация", "фіскальний чек", "фискальный чек", "програмний рро", "фіскальний сервер", "касовий чек онлайн", "каса checkbox", "фіскальний чек онлайн"]),
  t("1c-bas", "1С / BAS", ["1с", "1c", "bas", "бас бухгалтерія", "1с бухгалтерия", "обмін з 1с", "1с підприємство", "бас підприємство", "синхронізація з бас", "облік у 1с"]),
  t("medoc", "M.E.Doc", ["медок звітність", "звітність медок", "подати звіт через медок", "електронна звітність медок", "обмін документами медок", "медок"]),
  t("vchasno", "Вчасно", ["вчасно едо", "вчасно документообіг", "підписати документ у вчасно", "обмін документами вчасно", "електронний документообіг вчасно", "вчасноедок"]),

  // Держава й особа
  t("diia", "Дія", ["дія підпис", "дія.підпис", "дія підписати документ", "підписання через дія", "авторизація дія", "дія шеринг", "цифрові документи дія", "дия"]),
  t("bankid", "BankID", ["банк айді", "bank id", "банкайди", "авторизація bankid", "ідентифікація bankid", "вхід через банк", "підтвердження особи bankid", "ідентифікація через банк", "банкід", "банкид"]),

  // Маркетплейси й платформи продажів
  t("prom", "Prom.ua", ["prom ua", "пром юа", "prom.ua магазин", "кабінет продавця пром", "замовлення з пром", "імпорт на prom.ua", "синхронізація з пром", "пром"]),
  t("rozetka", "Rozetka", ["rozetka маркетплейс", "кабінет продавця розетка", "товари на розетці", "замовлення з rozetka", "продавати на розетці", "синхронізація каталогу rozetka", "розеткауа", "розетка"]),
  t("olx", "OLX", ["олх", "олікс", "оголошення олх", "кабінет olx", "публікація оголошень olx", "замовлення з олх", "інтеграція оголошень olx"]),
  t("epicentr", "Епіцентр маркетплейс", ["epicentrk", "кабінет продавця епіцентр", "товари на епіцентрі", "продавати на epicentr", "замовлення з епіцентру", "синхронізація з епіцентром", "епіцентр", "эпицентр"]),
  t("horoshop", "Хорошоп", ["хорошоп магазин", "кабінет хорошоп", "магазин на хорошоп", "замовлення хорошоп", "інтеграція з хорошоп"]),
  t("kasta", "Kasta", ["kasta.ua", "магазин kasta", "кабінет продавця kasta", "товари на kasta", "замовлення з kasta", "продавати на kasta", "кастауа", "каста"]),

  // CRM і продажі
  t("keycrm", "KeyCRM", ["кейсрм", "key crm", "keycrm інтеграція", "кабінет keycrm", "замовлення keycrm", "воронка keycrm", "синхронізація keycrm", "кейкрим"]),
  t("salesdrive", "SalesDrive", ["сейлсдрайв", "sales drive", "salesdrive інтеграція", "кабінет salesdrive", "замовлення salesdrive", "воронка salesdrive", "синхронізація salesdrive", "селсдрайв"]),
  t("bitrix24", "Bitrix24", ["бітрікс", "битрикс", "бітрікс24", "битрикс24", "bitrix", "портал bitrix24", "угоди bitrix24", "роботи bitrix24", "відкрита лінія bitrix24", "інтеграція з бітрікс"]),
  t("hubspot", "HubSpot", ["хабспот", "hubspot crm", "hubspot integration", "угоди hubspot", "контакти hubspot", "автоматизація hubspot"]),
  t("pipedrive", "Pipedrive", ["пайпдрайв", "pipedrive crm", "угоди pipedrive", "воронка pipedrive", "контакти pipedrive", "інтеграція pipedrive"]),
  t("kommo", "Kommo (amoCRM)", ["amocrm", "амосрм", "амо срм", "коммо crm", "amo crm інтеграція", "воронка kommo", "угоди amocrm", "контакти коммо", "амокрм"]),
  t("poster", "Poster POS", ["постер пос", "poster касса", "joinposter", "poster каса", "poster ресторан", "poster api", "замовлення poster", "posterpos"]),
  t("binotel", "Binotel / телефонія", ["бінотел", "бинотел", "ip-телефонія", "ip телефония", "ringostat", "рінгостат", "binotel api", "телефонія binotel", "дзвінки binotel", "інтеграція binotel", "call tracking binotel", "бінател", "бинател"]),

  // Google і Microsoft
  t("google-sheets", "Google Sheets", ["гугл таблиці", "гугл таблиця", "гугл таблицы", "google таблиці", "google таблицы", "таблиці google", "spreadsheets", "гугл шитс", "таблиця google sheets", "google spreadsheets", "синхронізація з гугл таблицями", "googlesheets", "гуглтаблиці", "у таблицю", "в таблицу", "из нескольких таблиц", "скидати в таблицю"]),
  t("excel", "Excel", ["ексель", "эксель", "xlsx", "microsoft excel", "таблиця excel", "файл ексель", "формула excel", "імпорт xlsx"]),
  t("google-calendar", "Google Calendar", ["гугл календар", "гугл календарь", "google календар", "календар гугл", "події google calendar", "синхронізація календаря гугл", "бронювання в google calendar", "googlecalendar", "гуглкалендар"]),
  t("google-drive", "Google Drive / Docs", ["гугл диск", "google диск", "google docs", "гугл документи", "гугл доки", "гугл драйв", "файли на гугл диску", "папка google drive", "документ google docs", "googledrive", "гуглдиск"]),
  t("google-maps", "Google Maps", ["гугл карти", "гугл карты", "google карти", "google places", "google maps api", "мітка на карті google", "маршрут google maps", "google places api", "вбудувати google maps", "googlemaps", "гуглкарти"]),
  t("google-analytics", "Google Analytics", ["гугл аналітика", "гугл аналитика", "ga4", "google tag manager", "gtm", "google analytics 4", "лічильник ga4", "події ga4", "відстеження google analytics", "аналітика сайту ga4", "googleanalytics", "гугланалітика", "гугланалитика", "аналітика на сайті"]),
  t("microsoft-365", "Microsoft 365", ["outlook", "microsoft teams", "office 365", "sharepoint", "лист outlook", "sharepoint документи", "календар outlook", "microsoft365", "майкрософт365", "офіс365"]),

  // Нотатки й задачі
  t("notion", "Notion", ["ноушн", "ноушен", "база notion", "сторінка notion", "notion api", "робочий простір notion", "таблиця notion", "нотион"]),
  t("airtable", "Airtable", ["ейртейбл", "эйртейбл", "база airtable", "airtable api", "таблиця airtable", "автоматизація airtable", "синхронізація airtable", "аіртейбл"]),
  t("trello", "Trello", ["трелло", "дошка завдань", "картки завдань", "список задач", "канбан-дошка", "trello board"]),
  t("jira", "Jira", ["джира", "джира таски", "джира тикеты", "issue tracker", "баг-трекер", "jira project"]),
  t("clickup", "ClickUp", ["клікап", "кликап", "click up", "клік ап", "задачі в clickup", "clickup tasks", "clickup api", "таск-трекер clickup"]),

  // Месенджери й соцмережі
  t("telegram-api", "Telegram (канали й API)", ["телеграм канал", "telegram канал", "автопостинг в телеграм", "telegram bot api", "телеграм бот api", "telegram webhook", "публікація в канал", "телеграм", "телега", "телегу", "тг", "телеграме", "телеграмі", "telegram"], { related: { "telegram-bot": 0.6 } }),
  t("viber-api", "Viber (розсилки й API)", ["вайбер розсилка", "viber розсилка", "viber", "viber bot api", "вайбер бот api", "бот для вайбер", "viber business messages", "вайбер повідомлення", "вайбер", "вайбері", "вайбера"], { related: { "viber-bot": 0.6 } }),
  t("whatsapp-api", "WhatsApp Business API", ["whatsapp business", "ватсап бізнес", "ватсап", "whatsapp", "whatsapp cloud api", "ватсап бот api", "бот для whatsapp", "whatsapp webhook", "шаблонні повідомлення", "Вотсап"], { related: { "whatsapp-bot": 0.6 } }),
  t("instagram", "Instagram", ["інстаграм", "инстаграм", "insta", "instagram api", "instagram graph api", "інстаграм магазин", "публікація в інстаграм", "instagram webhook", "из инсты", "из Instagram", "заявки губляться в директі", "заявки из инсты", "інста", "инста", "инсту", "інсту"], { related: { "instagram-bot": 0.6 } }),
  t("facebook", "Facebook / Meta", ["фейсбук", "meta", "meta pixel", "піксель фейсбук", "facebook graph api", "мета піксель", "фейсбук реклама", "facebook login", "meta business"]),
  t("tiktok", "TikTok", ["тікток", "тикток", "tiktok api", "тікток реклама", "відео тікток", "публікація тікток", "tiktok shop"]),
  t("youtube", "YouTube", ["ютуб", "youtube api", "youtube data api", "ютуб канал", "відео ютуб", "завантаження відео", "youtube webhook"]),

  // Розсилки
  t("esputnik", "eSputnik", ["еспутнік", "e-sputnik", "eSputnik api", "еспутнік розсилка", "тригерні листи", "сегментація контактів", "автоматизація розсилок", "еспутник"]),
  t("sendpulse", "SendPulse", ["сендпульс", "send pulse", "sendpulse api", "сендпульс розсилка", "автоматичні листи"]),
  t("mailchimp", "Mailchimp", ["мейлчімп", "мэйлчимп", "mailchimp api", "мейлчимп розсилка", "список підписників", "шаблон листа", "Мейлчимп"]),
  t("turbosms", "TurboSMS", ["турбосмс", "turbo sms", "turbosms api", "турбо смс", "відправка смс", "sms шлюз"]),
  t("resend", "Resend / SendGrid", ["sendgrid", "mailgun", "postmark", "resend api", "відправка email", "транзакційні листи", "поштовий api", "email провайдер"]),

  // ШІ-сервіси
  t("openai", "OpenAI API", ["open ai", "chatgpt api", "gpt api", "gpt-4", "gpt-4o", "чатгпт api", "інтеграція gpt", "gpt модель", "запит до gpt", "генерація через gpt", "ОпенЕйАй", "опенаі"]),
  t("anthropic", "Claude API", ["антропік", "anthropic api", "інтеграція claude", "модель claude", "антропик"]),
  t("gemini", "Gemini API", ["джеміні", "google ai studio", "google gemini api", "модель gemini", "запит до gemini", "генерація через gemini", "джемини"]),
  t("elevenlabs", "ElevenLabs", ["елевенлабс", "eleven labs", "синтез голосу", "elevenlabs api", "озвучення тексту", "голосова генерація", "клонування голосу", "text to speech"]),

  // Інше
  t("calendly", "Calendly", ["календлі", "календли", "calendly api", "запис через calendly", "слоти для зустрічі", "посилання для запису", "calendly webhook", "каленли"]),
  t("zoom", "Zoom", ["зум", "zoom api", "zoom meetings api", "zoom sdk", "створення zoom-зустрічі", "zoom webhook", "відеоконференція zoom"]),
  t("mapbox", "Mapbox / OpenStreetMap", ["openstreetmap", "osm", "леафлет", "leaflet", "mapbox api", "мапа mapbox", "карта на сайт", "геокодування", "Мапбокс"]),

  // Ще інтеграції
  t("helsi", "Helsi / Doc.ua", ["хелсі", "хелси", "doc.ua", "док юа", "helsi api", "запис до лікаря helsi", "кабінет лікаря", "медичний запис helsi"], { related: { medicine: 0.5 } }),
  t("ehealth", "eHealth (ЕСОЗ)", ["ехелс", "есоз", "електронна система охорони здоровʼя", "електронний рецепт", "е-рецепт", "ehealth api", "інтеграція з есоз", "медичні дані", "реєстр пацієнтів"], { related: { medicine: 0.6 } }),
  t("prozorro", "Prozorro", ["прозорро", "prozorro api", "тендери prozorro", "публічні закупівлі", "закупівлі через прозорро", "тендерна документація", "прозоро"], { related: { "tender-monitoring": 0.8 } }),
  t("opendatabot", "Opendatabot / YouControl", ["опендатабот", "youcontrol", "юконтрол", "перевірка контрагентів", "єдр", "едр", "opendatabot api", "youcontrol api", "перевірити компанію", "дані єдр", "реєстр юридичних осіб"]),
  t("easypay", "EasyPay / iPay / Platon", ["ізіпей", "изипей", "ipay", "platon", "tranzzo", "portmone business", "easypay api", "ipay api", "оплата через easypay", "платіжний шлюз", "інтернет-еквайринг"]),
  t("hotline", "Hotline / Price.ua", ["хотлайн", "hotline.ua", "price.ua", "прайс юа", "hotline api", "hotline ціни", "прайс агрегатор", "фід товарів hotline"]),
  t("etsy-amazon", "Etsy / Amazon / eBay", ["etsy", "етсі", "amazon", "амазон", "ebay", "ібей", "etsy api", "amazon marketplace", "ebay api", "продаж на etsy", "синхронізація маркетплейсів"]),
  t("google-merchant", "Google Merchant / Search Console", ["мерчант центр", "search console", "гугл серч консоль", "google merchant center", "товарний фід google", "фід для гугл покупок", "google shopping", "індексація товарів", "Merchant Center"]),
  t("forms-services", "Google Forms / Typeform / Tally", ["google forms", "гугл форми", "гугл формы", "typeform", "tally", "typeform api", "tally form", "форма опитування", "заявки з google forms", "відповіді google forms", "Тайпформ", "Таллі"]),
  t("support-chat-services", "HelpCrunch / Intercom / Crisp", ["helpcrunch", "intercom", "crisp", "tawk", "zendesk", "freshdesk", "chatwoot", "чат підтримки на сайті", "віджет онлайн-чату", "операторський чат", "звернення в підтримку", "чат віджет", "Хелпкранч", "Інтерком"], { related: { chat: 0.6, helpdesk: 0.6 } }),
  t("slack", "Slack", ["слак", "slack api", "повідомлення в slack", "slack webhook", "канал slack"], { related: { "slack-bot": 0.6 } }),
  t("github", "GitHub / GitLab", ["гітхаб", "гитхаб", "gitlab", "github api", "github repository", "gitlab repository", "репозиторій github", "gitlab ci", "запити pull request"]),
  t("monday", "Monday.com / Asana", ["monday.com", "мандей", "асана", "monday api", "asana api", "дошка проєкту", "таски в asana", "керування проєктами monday", "мондей", "asana"]),
  t("finmap", "Finmap / Dilovod", ["фінмап", "финмап", "dilovod", "діловод", "finmap api", "облік фінансів finmap", "фінансовий облік компанії", "рух грошей", "синхронізація витрат"], { related: { finance: 0.6 } }),
  t("product-analytics", "Mixpanel / Amplitude / PostHog", ["mixpanel", "amplitude", "posthog", "hotjar", "microsoft clarity", "mixpanel api", "posthog events", "відстеження подій", "аналітика поведінки", "воронка користувачів", "Мікспанель", "Амплітуд"], { related: { "web-analytics": 0.7 } }),
  t("twilio", "Twilio", ["твіліо", "твилио", "twilio api", "відправка sms twilio", "дзвінки через twilio", "twilio webhook", "телефонний номер twilio"], { related: { sms: 0.6, "voice-bot": 0.4 } }),
  t("uklon-bolt", "Uklon / Bolt (API таксі)", ["уклон", "uklon", "bolt таксі", "болт таксі", "uklon api", "bolt api", "виклик таксі", "замовлення поїздки", "таксі через api"], { related: { transport: 0.6 } }),
  t("linkedin", "LinkedIn", ["лінкедін", "линкедин", "linkedin api", "linkedin login", "профіль linkedin", "публікація в linkedin", "linkedin oauth"], { related: { hr: 0.5 } }),
];
