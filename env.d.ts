// env.d.ts
interface CloudflareEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  /** R2: фото профілів (photos/…); потім файли запитів і чату. */
  UPLOADS: R2Bucket;
  DEPLOY_ENV: string;
  /** Секрет підпису сесій, від 32 символів. */
  AUTH_SECRET?: string;
  /** Ключ Resend для листів із кодом; без нього локально код завжди 000000. */
  RESEND_API_KEY?: string;
  /** Адреса відправника, напр. "Vibe Map <hello@uposhuku.com>". */
  MAIL_FROM?: string;
  /** "dev": тестовий вхід (код 000000) навіть із ключем Resend. Не діє на проді. */
  MAIL_MODE?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
