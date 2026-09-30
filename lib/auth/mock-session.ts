// lib/auth/mock-session.ts
//
// Сесія-заглушка: користувач лежить прямо в cookie, base64 від JSON, без
// підпису. Годиться лише для локального прев'ю (lib/auth/config.ts). Справжня
// сесія — JWT (jose, HS256) з jti = рядок у таблиці sessions, як в ukoshiku.

import { cookies } from "next/headers";
import type { SessionUser } from "./types";

const COOKIE = "vm_session";
const MAX_AGE = 30 * 24 * 60 * 60;

/** Стабільний id з пошти: той самий вхід — той самий користувач і його запити. */
const idFromEmail = async (email: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return `u_${Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

export const createMockUser = async (email: string, via: SessionUser["via"], name: string | null = null): Promise<SessionUser> => ({
  id: await idFromEmail(email),
  email,
  name,
  via,
});

export const setMockSession = async (user: SessionUser) => {
  const store = await cookies();
  store.set(COOKIE, Buffer.from(JSON.stringify(user)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
};

export const readMockSession = async (): Promise<SessionUser | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const user = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<SessionUser>;
    if (typeof user.id !== "string" || typeof user.email !== "string") return null;
    return { id: user.id, email: user.email, name: user.name ?? null, via: user.via === "google" ? "google" : "email" };
  } catch {
    return null;
  }
};

export const clearMockSession = async () => {
  (await cookies()).delete(COOKIE);
};
