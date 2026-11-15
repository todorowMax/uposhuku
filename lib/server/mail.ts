// lib/server/mail.ts
//
// Лист із кодом входу через Resend. Без ключа (локально) лист не йде, а код
// друкуємо в лог сервера: для розробки цього досить.

import { CONTACT_EMAIL, OPERATOR, SERVICE_NAME } from "@/lib/legal/config";
import { DEAL_TEXTS, payReminderLead, type EmailEvent } from "@/lib/telegram/notices";
import { excerpt } from "@/lib/telegram/texts";
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
const deliver = async (message: { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> }) => {
  const key = readVar("RESEND_API_KEY");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: readVar("MAIL_FROM") ?? "Findlyfy <hello@findlyfy.com>",
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    }),
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

/** Лист адміністраторам (ADMIN_EMAILS) про те, що потребує людини. Без персональних даних, лише номер угоди й суть. */
export const sendAdminNotice = async (emails: string[], subject: string, text: string) => {
  if (mailMode() === "dev" || !readVar("RESEND_API_KEY")) {
    console.log(`[mail:dev] адміністраторам (${emails.length}): ${subject}`);
    return;
  }
  for (const to of emails) await deliver({ to, subject, text });
};

/** Лист з кодом підтвердження видалення акаунта. */
export const sendDeletionCodeMail = async (email: string, code: string) => {
  if (mailMode() === "dev" || !readVar("RESEND_API_KEY")) {
    console.log(`[mail:dev] код видалення акаунта для ${email}: ${code}`);
    return;
  }
  await deliver({
    to: email,
    subject: `Код для видалення акаунта: ${code}`,
    text: `Ви видаляєте акаунт у Findlyfy. Код підтвердження: ${code}\n\nВін діє 10 хвилин. Якщо це не ви, нічого не вводьте й змініть спосіб входу в акаунт.`,
  });
};

/** Лист замовнику з кодом підтвердження приймання етапу (від 10 000 ₴). */
export const sendReleaseCodeMail = async (email: string, code: string, dealNumber: string) => {
  if (mailMode() === "dev" || !readVar("RESEND_API_KEY")) {
    console.log(`[mail:dev] код приймання угоди ${dealNumber} для ${email}: ${code}`);
    return;
  }
  await deliver({
    to: email,
    subject: `Код підтвердження виплати: ${code}`,
    text: `Ви приймаєте роботу за угодою ${dealNumber}, після цього гроші підуть виконавцю і повернути їх не можна. Код підтвердження: ${code}\n\nВін діє 10 хвилин. Якщо це не ви, нічого не вводьте й змініть спосіб входу в акаунт.`,
  });
};

const htmlEscape = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface NoticeMailInput {
  event: EmailEvent;
  /** Скільки подій цього виду ми притримали за останні півгодини: «ще N нових». */
  held: number;
  siteUrl: string;
  unsubscribeUrl: string;
}

/** Тема й перший рядок листа за видом події; тексту повідомлень тут немає (лише ім'я чи назва запиту). */
const noticeTexts = (event: EmailEvent): { lead: string; subject: string } => {
  if (event.type === "message") {
    const name = excerpt(event.fromName, 40);
    return { lead: `Нове повідомлення від ${name}.`, subject: `Нове повідомлення від ${name}` };
  }
  if (event.type === "offer") {
    const title = excerpt(event.title, 60);
    return { lead: `Новий відгук на ваш запит «${title}».`, subject: `Новий відгук на ваш запит «${title}»` };
  }
  if (event.type === "renew") {
    const title = excerpt(event.title, 60);
    return {
      lead: `Ще актуально? Ваш запит «${title}» висить уже 14 днів. Якщо не відповісти за 3 дні, він закриється, його можна буде відновити протягом 7 днів.`,
      subject: `Ще актуально? Запит «${title}»`,
    };
  }
  return { lead: payReminderLead(event.action, event.stageTitle) ?? DEAL_TEXTS[event.action] ?? "Є зміни за вашою угодою.", subject: "Зміни за вашою угодою у Findlyfy" };
};

/**
 * Єдиний шаблон листа-сповіщення (повідомлення, відгук, угода). Лише факт події, ім'я співрозмовника з профілю чи назва
 * власного запиту, посилання на сайт і відписка; тексту повідомлень, пошти й телефонів немає. Без картинок і трекерів.
 * Підпис і реквізити Оператора з lib/legal/config.ts. Чиста функція: тести читають її результат.
 */
export const renderNoticeMail = ({ event, held, siteUrl, unsubscribeUrl }: NoticeMailInput): { subject: string; text: string; html: string } => {
  const { lead, subject } = noticeTexts(event);
  const more = held > 0 ? `Поки вас не було, ще ${held} нових.` : "";
  const link = `${siteUrl}/?open=${encodeURIComponent(event.open)}`;
  const operator = [SERVICE_NAME, `${OPERATOR.entity}, РНОКПП ${OPERATOR.taxId}`, OPERATOR.address, CONTACT_EMAIL];
  const reason = "Ви отримали цей лист, бо в налаштуваннях сповіщень увімкнено пошту, а вас не було в сервісі.";
  const text = [lead, ...(more ? [more] : []), `Відкрити: ${link}`, "--", ...operator, "", reason, `Відписатися від таких листів: ${unsubscribeUrl}`].join("\n");
  const html = [
    '<div style="font-family:sans-serif;line-height:1.5;max-width:560px">',
    `<p>${htmlEscape(lead)}</p>`,
    more ? `<p>${htmlEscape(more)}</p>` : "",
    `<p><a href="${htmlEscape(link)}">Відкрити у ${SERVICE_NAME}</a></p>`,
    `<p style="font-size:13px">${operator.map(htmlEscape).join("<br>")}</p>`,
    `<p style="font-size:13px">${htmlEscape(reason)} <a href="${htmlEscape(unsubscribeUrl)}">Відписатися від таких листів</a></p>`,
    "</div>",
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, text, html };
};

/** Лист-сповіщення; з посиланням відписки й заголовками List-Unsubscribe (один клік). У dev-режимі лише в журнал. */
export const sendNoticeMail = async (to: string, input: NoticeMailInput) => {
  const mail = renderNoticeMail(input);
  if (mailMode() === "dev" || !readVar("RESEND_API_KEY")) {
    console.log(`[mail:dev] сповіщення для ${to}: ${mail.subject}\n${mail.text}`);
    return;
  }
  await deliver({ to, ...mail, headers: { "List-Unsubscribe": `<${input.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
};
