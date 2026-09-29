// lib/tags/groups/integration.ts — з чим продукт інтегрується.
import { tag } from "../types";

const t = tag("integration");

export const INTEGRATION_TAGS = [
  // Доставка
  t("nova-poshta", "Нова Пошта", ["новая почта", "novaposhta", "нову пошту", "новою поштою", "api нової пошти"]),
  t("ukrposhta", "Укрпошта", ["укрпочта"]),
  t("meest", "Meest", ["міст експрес", "meest express", "мист экспресс"]),
  t("rozetka-delivery", "Rozetka Delivery", ["розетка делівері"]),
  t("glovo", "Glovo / Bolt Food", ["глово", "bolt food", "болт фуд"]),

  // Платежі
  t("monobank", "Monobank", ["монобанк", "mono", "моно", "monobank api", "еквайринг моно", "plata by mono"]),
  t("privatbank", "ПриватБанк", ["приват", "приват24", "privat24"]),
  t("liqpay", "LiqPay", ["лікпей", "ликпей", "liq pay"]),
  t("wayforpay", "WayForPay", ["вейфорпей", "way for pay"]),
  t("fondy", "Fondy", ["фонді", "фонди платежі"]),
  t("portmone", "Portmone", ["портмоне"]),
  t("stripe", "Stripe", ["страйп"]),
  t("paypal", "PayPal", ["пейпал", "пэйпал"]),
  t("apple-google-pay", "Apple Pay / Google Pay", ["apple pay", "google pay", "епл пей", "гугл пей"]),
  t("crypto-payments", "Оплата криптою", ["оплата криптой", "usdt", "binance pay"], { related: { crypto: 0.6 } }),

  // Фіскалізація й облік
  t("checkbox", "Checkbox (ПРРО)", ["чекбокс", "прро", "прро checkbox", "рро", "фіскалізація", "фискализация", "фіскальний чек", "фискальный чек"]),
  t("1c-bas", "1С / BAS", ["1с", "1c", "bas", "бас бухгалтерія", "1с бухгалтерия"]),
  t("medoc", "M.E.Doc", ["медок"]),
  t("vchasno", "Вчасно", ["вчасно едо"]),

  // Держава й особа
  t("diia", "Дія", ["дия", "дія підпис", "дія.підпис"]),
  t("bankid", "BankID", ["банк айді", "bank id", "банкайди"]),

  // Маркетплейси й платформи продажів
  t("prom", "Prom.ua", ["пром", "prom ua", "пром юа"]),
  t("rozetka", "Rozetka", ["розетка", "rozetka маркетплейс"]),
  t("olx", "OLX", ["олх", "олікс"]),
  t("epicentr", "Епіцентр маркетплейс", ["епіцентр", "эпицентр", "epicentrk"]),
  t("horoshop", "Хорошоп", []),
  t("kasta", "Kasta", ["каста", "kasta.ua"]),

  // CRM і продажі
  t("keycrm", "KeyCRM", ["кейсрм", "key crm"]),
  t("salesdrive", "SalesDrive", ["сейлсдрайв", "sales drive"]),
  t("bitrix24", "Bitrix24", ["бітрікс", "битрикс", "бітрікс24", "битрикс24", "bitrix"]),
  t("hubspot", "HubSpot", ["хабспот"]),
  t("pipedrive", "Pipedrive", ["пайпдрайв"]),
  t("kommo", "Kommo (amoCRM)", ["amocrm", "амосрм", "амо срм"]),
  t("poster", "Poster POS", ["постер пос", "poster касса", "joinposter"]),
  t("binotel", "Binotel / телефонія", ["бінотел", "бинотел", "ip-телефонія", "ip телефония", "ringostat", "рінгостат"]),

  // Google і Microsoft
  t("google-sheets", "Google Sheets", ["гугл таблиці", "гугл таблиця", "гугл таблицы", "google таблиці", "google таблицы", "таблиці google", "spreadsheets"]),
  t("excel", "Excel", ["ексель", "эксель", "xlsx", "microsoft excel"]),
  t("google-calendar", "Google Calendar", ["гугл календар", "гугл календарь", "google календар"]),
  t("google-drive", "Google Drive / Docs", ["гугл диск", "google диск", "google docs", "гугл документи", "гугл доки"]),
  t("google-maps", "Google Maps", ["гугл карти", "гугл карты", "google карти", "google places"]),
  t("google-analytics", "Google Analytics", ["гугл аналітика", "гугл аналитика", "ga4", "google tag manager", "gtm"]),
  t("microsoft-365", "Microsoft 365", ["outlook", "microsoft teams", "office 365", "sharepoint"]),

  // Нотатки й задачі
  t("notion", "Notion", ["ноушн", "ноушен"]),
  t("airtable", "Airtable", ["ейртейбл", "эйртейбл"]),
  t("trello", "Trello", ["трелло"]),
  t("jira", "Jira", ["джира"]),
  t("clickup", "ClickUp", ["клікап", "кликап", "click up"]),

  // Месенджери й соцмережі
  t("telegram-api", "Telegram (канали й API)", ["телеграм канал", "telegram канал", "автопостинг в телеграм"], { related: { "telegram-bot": 0.6 } }),
  t("viber-api", "Viber (розсилки й API)", ["вайбер розсилка", "viber розсилка", "вайбер", "viber"], { related: { "viber-bot": 0.6 } }),
  t("whatsapp-api", "WhatsApp Business API", ["whatsapp business", "ватсап бізнес", "ватсап", "whatsapp"], { related: { "whatsapp-bot": 0.6 } }),
  t("instagram", "Instagram", ["інстаграм", "инстаграм", "insta", "інста", "instagram api"], { related: { "instagram-bot": 0.6 } }),
  t("facebook", "Facebook / Meta", ["фейсбук", "meta", "meta pixel", "піксель фейсбук"]),
  t("tiktok", "TikTok", ["тікток", "тикток"]),
  t("youtube", "YouTube", ["ютуб", "youtube api"]),

  // Розсилки
  t("esputnik", "eSputnik", ["еспутнік", "e-sputnik"]),
  t("sendpulse", "SendPulse", ["сендпульс", "send pulse"]),
  t("mailchimp", "Mailchimp", ["мейлчімп", "мэйлчимп"]),
  t("turbosms", "TurboSMS", ["турбосмс", "turbo sms"]),
  t("resend", "Resend / SendGrid", ["sendgrid", "mailgun", "postmark"]),

  // ШІ-сервіси
  t("openai", "OpenAI API", ["open ai", "chatgpt api", "gpt api", "gpt-4", "gpt-4o", "чатгпт api"]),
  t("anthropic", "Claude API", ["антропік"]),
  t("gemini", "Gemini API", ["джеміні", "google ai studio"]),
  t("elevenlabs", "ElevenLabs", ["елевенлабс", "eleven labs", "синтез голосу"]),

  // Інше
  t("calendly", "Calendly", ["календлі", "календли"]),
  t("zoom", "Zoom", ["зум", "zoom api"]),
  t("mapbox", "Mapbox / OpenStreetMap", ["openstreetmap", "osm", "леафлет", "leaflet"]),

  // Ще інтеграції
  t("helsi", "Helsi / Doc.ua", ["хелсі", "хелси", "doc.ua", "док юа"], { related: { medicine: 0.5 } }),
  t("ehealth", "eHealth (ЕСОЗ)", ["ехелс", "есоз", "електронна система охорони здоровʼя", "електронний рецепт", "е-рецепт"], { related: { medicine: 0.6 } }),
  t("prozorro", "Prozorro", ["прозорро", "прозоро"], { related: { "tender-monitoring": 0.8 } }),
  t("opendatabot", "Opendatabot / YouControl", ["опендатабот", "youcontrol", "юконтрол", "перевірка контрагентів", "єдр", "едр"]),
  t("easypay", "EasyPay / iPay / Platon", ["ізіпей", "изипей", "ipay", "platon", "tranzzo", "portmone business"]),
  t("hotline", "Hotline / Price.ua", ["хотлайн", "hotline.ua", "price.ua", "прайс юа"]),
  t("etsy-amazon", "Etsy / Amazon / eBay", ["etsy", "етсі", "amazon", "амазон", "ebay", "ібей"]),
  t("google-merchant", "Google Merchant / Search Console", ["мерчант центр", "search console", "гугл серч консоль"]),
  t("forms-services", "Google Forms / Typeform / Tally", ["google forms", "гугл форми", "гугл формы", "typeform", "tally"]),
  t("support-chat-services", "HelpCrunch / Intercom / Crisp", ["helpcrunch", "intercom", "crisp", "tawk", "zendesk", "freshdesk", "chatwoot"], { related: { chat: 0.6, helpdesk: 0.6 } }),
  t("slack", "Slack", ["слак", "slack api"], { related: { "slack-bot": 0.6 } }),
  t("github", "GitHub / GitLab", ["гітхаб", "гитхаб", "gitlab", "github api"]),
  t("monday", "Monday.com / Asana", ["monday.com", "мандей", "asana", "асана"]),
  t("finmap", "Finmap / Dilovod", ["фінмап", "финмап", "dilovod", "діловод"], { related: { finance: 0.6 } }),
  t("product-analytics", "Mixpanel / Amplitude / PostHog", ["mixpanel", "amplitude", "posthog", "hotjar", "microsoft clarity"], { related: { "web-analytics": 0.7 } }),
  t("twilio", "Twilio", ["твіліо", "твилио"], { related: { sms: 0.6, "voice-bot": 0.4 } }),
  t("uklon-bolt", "Uklon / Bolt (API таксі)", ["уклон", "uklon", "bolt таксі", "болт таксі"], { related: { transport: 0.6 } }),
];
