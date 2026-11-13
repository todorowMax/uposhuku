// lib/server/unsubscribe-token.ts
//
// Підписане посилання «Відписатися» з листа. Нічого не зберігаємо: токен це JWT (HS256) тим самим ключем, що й сесії
// (session-secret.ts), але з окремою аудиторією й без `jti`. Тому токен відписки не відкриває сесію (її перевірка
// вимагає `jti`), а сесійний токен не відписує (немає аудиторії). Строку немає: посилання зі старого листа працює завжди.

import { SignJWT, jwtVerify } from "jose";
import { readVar } from "./env";
import { sessionSecret } from "./session-secret";

const AUDIENCE = "email-unsubscribe";

const key = () => sessionSecret({ AUTH_SECRET: readVar("AUTH_SECRET"), DEPLOY_ENV: readVar("DEPLOY_ENV") });

/** Токен для людини; null, коли ключа немає (прод без AUTH_SECRET): тоді лист без посилання не шлемо. */
export const signUnsubscribeToken = async (userId: string): Promise<string | null> => {
  const secret = key();
  if (!secret) return null;
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setAudience(AUDIENCE).sign(secret);
};

/** Хто відписується; null, якщо токен підроблений, чужий чи порожній. */
export const verifyUnsubscribeToken = async (token: string | null | undefined): Promise<string | null> => {
  const secret = key();
  if (!secret || !token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: AUDIENCE, algorithms: ["HS256"] });
    return payload.sub || null;
  } catch {
    return null;
  }
};
