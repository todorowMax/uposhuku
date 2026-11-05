// env.d.ts
interface CloudflareEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  /** D1 телеметрії (kit/telemetry): помилки й події. Немає привʼязки: телеметрія вимкнена. */
  TELEMETRY_DB?: D1Database;
  /** Версія збірки (git sha): пишемо в помилки, щоб бачити, у якому релізі зламалося. */
  RELEASE?: string;
  /** R2: фото профілів (photos/…); потім файли запитів і чату. */
  UPLOADS: R2Bucket;
  /** Durable Object «кімната» для WebSocket (worker/realtime.ts). Немає в локальному next dev. */
  REALTIME: DurableObjectNamespace;
  DEPLOY_ENV: string;
  /** Секрет підпису сесій, від 32 символів. */
  AUTH_SECRET?: string;
  /** Ключ Resend для листів із кодом; без нього локально код завжди 000000. */
  RESEND_API_KEY?: string;
  /** Адреса відправника, напр. "Findlyfy <hello@findlyfy.com>". */
  MAIL_FROM?: string;
  /** "dev": тестовий вхід (код 000000) навіть із ключем Resend. Не діє на проді. */
  MAIL_MODE?: string;
  /** Код доступу тестового входу (4–8 цифр), напр. 2628. Без нього тестовий код 000000. Секретом, не в git. */
  DEV_LOGIN_CODE?: string;
  /** Токен бота від @BotFather. Секрет. Без нього бот вимкнений. */
  TELEGRAM_BOT_TOKEN?: string;
  /** Секрет вебхука: Telegram шле його в заголовку, ми звіряємо. Секрет. */
  TELEGRAM_WEBHOOK_SECRET?: string;
  /** Username бота без @: для посилань t.me/<username>?start=… Не секрет. */
  TELEGRAM_BOT_USERNAME?: string;
  /** Id публічного каналу запитів (від'ємний, -100…). */
  TELEGRAM_CHANNEL_ID?: string;
  /** Адреса сайту для посилань із бота й каналу. */
  SITE_URL?: string;
  /** "1" вмикає публікацію запитів у канал. */
  CHANNEL_ENABLED?: string;
  /** Через скільки хвилин після створення запит потрапляє в канал (типово 20). */
  CHANNEL_DELAY_MIN?: string;
  /** Токен для внутрішніх викликів cron → /api/internal/tick. Секрет. */
  INTERNAL_TOKEN?: string;
  /** Токен еквайрингу Monobank: тестовий з api.monobank.ua або бойовий з кабінету web.monobank.ua. Секрет. */
  MONOBANK_TOKEN?: string;
  /** Токен терміналу розщеплення Monobank (безпечна угода). Секрет. Окремий від MONOBANK_TOKEN: вебхук підписує той термінал, чий рахунок. */
  MONOBANK_SPLIT_TOKEN?: string;
  /** splitReceiverId нашого ФОП у розщепленні: отримувач комісії платформи. Не секрет, але з кабінету банку. */
  MONOBANK_PLATFORM_RECEIVER_ID?: string;
  /** Безпечна угода: "off" (типово) | "allowlist" | "on". Невідоме значення це off. */
  SAFE_DEAL_MODE?: string;
  /** Пошти через кому, яким доступна безпечна угода в режимі allowlist. */
  SAFE_DEAL_USERS?: string;
  /** Прапорці функцій: <ІМ'Я>_MODE ("off" | "allowlist" | "on") і <ІМ'Я>_USERS (пошти через кому). Збережене в адмінці важливіше. */
  CRYPTO_PROOF_MODE?: string;
  CRYPTO_PROOF_USERS?: string;
  CRYPTO_WALLET_MODE?: string;
  CRYPTO_WALLET_USERS?: string;
  CRYPTO_ESCROW_MODE?: string;
  CRYPTO_ESCROW_USERS?: string;
  NBU_QR_MODE?: string;
  NBU_QR_USERS?: string;
  /** Оплати з гаманця (EVM): id мережі, адреса токена USDT (звірити зі сторінкою Tether), FeeRouter, EscrowFactory, RPC для перевірки транзакцій. RPC може містити ключ: секрет. */
  CRYPTO_CHAIN_ID?: string;
  CRYPTO_TOKEN_ADDRESS?: string;
  CRYPTO_ROUTER_ADDRESS?: string;
  CRYPTO_FACTORY_ADDRESS?: string;
  CRYPTO_RPC_URL?: string;
  /** Ключ TronGrid: необов'язковий, піднімає ліміт запитів. Секрет. */
  TRONGRID_API_KEY?: string;
  /** Ключ шифрування реквізитів виконавців: base64, 32 байти (`openssl rand -base64 32`). Секрет; без нього реквізити не зберігаються (503). */
  REQUISITES_KEY?: string;
  /** Пошти адміністраторів через кому: єдиний доступ до /admin і /api/admin. Без значення адмінки немає. */
  ADMIN_EMAILS?: string;
  /** Хости, з яких доступна адмінка, через кому (напр. прихований піддомен). Задано: на решті хостів 404. Не задано: на проді адмінки немає. Не в git, секретом. */
  ADMIN_HOSTS?: string;
  /** "1": пускати в адмінку й після тестового входу (код 000000). Лише локально, у .dev.vars. */
  ADMIN_DEV_LOGIN?: string;
  /** Секрет TOTP модератора (base32, як у автентифікаторах). Секрет. Без нього на проді грошові рішення спорів недоступні. */
  ADMIN_TOTP_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
