// lib/server/mail.ts
//
// Лист із кодом входу через Resend. Без ключа (локально) лист не йде, а код
// друкуємо в лог сервера: для розробки цього досить.

import { logServer } from "@/lib/telemetry/log";
import { readVar } from "./env";

export type MailMode = "resend" | "dev" | "off";

/** resend — справжні листи; dev — тестовий вхід, код 000000 (без ключа або з MAIL_MODE=dev, лише поза продом); off — прод без ключа, вхід вимкнений. */
export const mailMode = (): MailMode => {
  if (readVar("DEPLOY_ENV") === "production") return readVar("RESEND_API_KEY") ? "resend" : "off";
  // Тестовий вхід без пошти: MAIL_MODE=dev у dev-воркері, доки немає свого домену для листів.
  if (readVar("MAIL_MODE") === "dev") return "dev";
  return readVar("RESEND_API_KEY") ? "resend" : "dev";
};

/** Надіслати лист через Resend; помилка кидається, щоб викликач вирішив, чи вона критична. */
const deliver = async (message: { to: string; subject: string; text: string }) => {
  const key = readVar("RESEND_API_KEY");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: readVar("MAIL_FROM") ?? "Findlyfy <hello@findlyfy.com>", to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    // Без листа людина не увійде: це треба бачити в журналі, не лише в відповіді 500.
    logServer({ level: "error", event: "mail_send_failed", message: `Resend відповів ${response.status}`, detail: { status: response.status, body } });
    throw new Error(`Resend відповів ${response.status}: ${body}`);
  }
};

export const sendLoginCode = async (email: string, code: string) => {
  if (mailMode() === "dev" || !readVar("RESEND_API_KEY")) {
    console.log(`[mail:dev] код для ${email}: ${code}`);
    return;
  }
  await deliver({
    to: email,
    subject: `Код входу: ${code}`,
    text: `Ваш код для входу у Findlyfy: ${code}\n\nВін діє 10 хвилин. Якщо ви не просили код, просто проігноруйте цей лист.`,
  });
};

/** Лист виконавцю про зміну реквізитів: нові значення почнуть діяти після `effectiveAt`. Самих реквізитів у листі немає. */
export const sendRequisitesChangeNotice = async (email: string, effectiveAt: number) => {
  if (mailMode() === "dev" || !readVar("RESEND_API_KEY")) {
    console.log(`[mail:dev] зміна реквізитів для ${email}`);
    return;
  }
  const when = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "long", timeStyle: "short" }).format(effectiveAt);
  await deliver({
    to: email,
    subject: "Змінено реквізити для оплати у Findlyfy",
    text: `У вашому кабінеті змінили реквізити для переказів. Нові значення почнуть діяти ${when} (за Києвом). До цього часу, а також в усіх угодах, які вже прийняті, лишаються попередні реквізити.\n\nЯкщо це були не ви, негайно змініть спосіб входу в акаунт і напишіть нам.`,
  });
};
