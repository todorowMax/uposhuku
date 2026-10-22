// scripts/telegram-setup.ts
//
// Налаштовує бота в Telegram: вебхук на наш воркер, команди й опис. Запускати
// після кожного нового деплою на нову адресу (dev, прод) і коли міняється
// секрет вебхука. Токен і секрет беремо зі змінних оболонки й ніде не друкуємо:
//
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
//     npm run tg:setup -- --url https://uposhuku-development.uposhuku.workers.dev
//
//   npm run tg:setup -- --delete     прибрати вебхук (для локальної розробки без публічної адреси)
//   npm run tg:setup -- --info       лише показати, що зараз налаштовано

import { callTelegram } from "../lib/telegram/api";
import { TEXTS } from "../lib/telegram/texts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token) {
  console.error("Потрібна змінна TELEGRAM_BOT_TOKEN (токен від @BotFather).");
  process.exit(1);
}
const options = { token };

const COMMANDS = [
  { command: "start", description: "Почати" },
  { command: "settings", description: "Налаштування сповіщень" },
  { command: "stop", description: "Вимкнути сповіщення" },
  { command: "help", description: "Допомога" },
];

const DESCRIPTION = "Сповіщення Vibe Map: нові пропозиції на ваш запит, повідомлення в чаті, угоди й запити під ваші теги. Підключається на сайті: Сповіщення → Telegram.";
const SHORT_DESCRIPTION = "Сповіщення з Vibe Map: пропозиції, повідомлення, угоди.";

const show = async () => {
  const info = await callTelegram<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number; allowed_updates?: string[] }>("getWebhookInfo", {}, options);
  const me = await callTelegram<{ username: string; first_name: string }>("getMe", {}, options);
  console.log(`Бот: @${me.username} («${me.first_name}»)`);
  console.log(`Вебхук: ${info.url || "(не задано)"}`);
  console.log(`Чекає оновлень: ${info.pending_update_count}`);
  console.log(`Дозволені оновлення: ${(info.allowed_updates ?? []).join(", ") || "(усі)"}`);
  if (info.last_error_message) console.log(`Остання помилка доставки: ${info.last_error_message} (${info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : "?"})`);
  console.log(`Не забудьте: у .dev.vars і в секретах воркера TELEGRAM_BOT_USERNAME=${me.username}`);
};

const main = async () => {
  if (args.includes("--info")) return show();
  if (args.includes("--delete")) {
    await callTelegram("deleteWebhook", { drop_pending_updates: true }, options);
    console.log("Вебхук прибрано.");
    return show();
  }
  const url = flag("url");
  if (!url || !/^https:\/\//.test(url)) {
    console.error("Потрібна публічна https-адреса воркера: --url https://… (Telegram не приймає http і localhost).");
    process.exit(1);
  }
  if (!secret || secret.length < 16) {
    console.error("Потрібна змінна TELEGRAM_WEBHOOK_SECRET від 16 символів (openssl rand -hex 32), та сама, що в секретах воркера.");
    process.exit(1);
  }

  await callTelegram(
    "setWebhook",
    {
      url: `${url.replace(/\/$/, "")}/api/telegram/webhook`,
      secret_token: secret,
      // Лише те, що обробляємо: повідомлення, кнопки й зміни статусу бота (блокування, додавання в канал).
      allowed_updates: ["message", "callback_query", "my_chat_member"],
      drop_pending_updates: true,
    },
    options
  );
  // Команди без мови (типові) і для українського інтерфейсу.
  await callTelegram("setMyCommands", { commands: COMMANDS }, options);
  await callTelegram("setMyCommands", { commands: COMMANDS, language_code: "uk" }, options);
  await callTelegram("setMyDescription", { description: DESCRIPTION }, options);
  await callTelegram("setMyShortDescription", { short_description: SHORT_DESCRIPTION }, options);
  console.log(`Налаштовано. Привітання бота: «${TEXTS.welcome.slice(0, 40)}…»`);
  await show();
};

main().catch((error) => {
  // Повідомлення TelegramError не містить токена.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
