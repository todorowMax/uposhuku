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
  /** Пошти адміністраторів через кому: єдиний доступ до /admin і /api/admin. Без значення адмінки немає. */
  ADMIN_EMAILS?: string;
  /** Хости, з яких доступна адмінка, через кому (напр. прихований піддомен). Задано: на решті хостів 404. Не задано: на проді адмінки немає. Не в git, секретом. */
  ADMIN_HOSTS?: string;
  /** "1": пускати в адмінку й після тестового входу (код 000000). Лише локально, у .dev.vars. */
  ADMIN_DEV_LOGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
