// lib/server/mail.ts
//
// Лист із кодом входу через Resend. Без ключа (локально) лист не йде, а код
// друкуємо в лог сервера: для розробки цього досить.

import { readVar } from "./env";

export type MailMode = "resend" | "dev" | "off";

/** resend — справжні листи; dev — без ключа поза продом; off — прод без ключа, вхід вимкнений. */
export const mailMode = (): MailMode => {
  if (readVar("RESEND_API_KEY")) return "resend";
  return readVar("DEPLOY_ENV") === "production" ? "off" : "dev";
};

export const sendLoginCode = async (email: string, code: string) => {
  const key = readVar("RESEND_API_KEY");
  if (!key) {
    console.log(`[mail:dev] код для ${email}: ${code}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: readVar("MAIL_FROM") ?? "Vibe Map <hello@uposhuku.com>",
      to: [email],
      subject: `Код входу: ${code}`,
      text: `Ваш код для входу у Vibe Map: ${code}\n\nВін діє 10 хвилин. Якщо ви не просили код, просто проігноруйте цей лист.`,
    }),
  });
  if (!response.ok) throw new Error(`Resend відповів ${response.status}`);
};
