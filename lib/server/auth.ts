// lib/server/auth.ts
//
// Користувачі, коди з пошти й сесії на D1. Правила з docs/plan-mvp.md:
// у базі лише SHA-256 від `userId:код`, код живе 10 хв, 5 спроб введення,
// повторний лист не частіше разу на 60 с, ліміти в базі. Сесія — JWT (HS256)
// у HttpOnly-cookie, `jti` = рядок у `sessions`, без нього токен мертвий.

import { and, eq, gt } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/auth/types";
import { MOCK_CODE } from "@/lib/auth/config";
import { authAttempts, emailCodes, sessions, users } from "@/db/schema";
import { getDb, type Db } from "./db";
import { isProduction, readVar } from "./env";
import { mailMode, sendLoginCode } from "./mail";

const COOKIE = "vm_session";
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 30 * DAY;
const IDLE_TTL = 14 * DAY;
const CODE_TTL = 10 * 60 * 1000;
const RESEND_GAP = 60 * 1000;
const MAX_CODE_TRIES = 5;
const WINDOW = 15 * 60 * 1000;
const MAX_STARTS = 8;
const MAX_FAILS = 8;

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string,
    readonly type = "about:blank",
  ) {
    super(detail);
  }
}

const secret = () => {
  const value = readVar("AUTH_SECRET");
  if (value && value.length >= 32) return new TextEncoder().encode(value);
  // Локально без секрету підписуємо ключем розробки; на проді без секрету входу немає.
  if (!isProduction()) return new TextEncoder().encode("dev-only-secret-dev-only-secret-dev-only");
  throw new AuthError(503, "Вхід ще не підключено", "Спробуйте трохи згодом.");
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
};

const toSessionUser = (user: typeof users.$inferSelect, via: SessionUser["via"]): SessionUser => ({
  id: user.id,
  email: user.email,
  name: user.displayName,
  via,
});

/** Скільки записів ліміту за вікно. */
const countAttempts = async (db: Db, key: string, kind: "email_start" | "email_verify_fail") => {
  const rows = await db
    .select({ id: authAttempts.id })
    .from(authAttempts)
    .where(and(eq(authAttempts.key, key), eq(authAttempts.kind, kind), gt(authAttempts.createdAt, Date.now() - WINDOW)));
  return rows.length;
};

const recordAttempt = (db: Db, key: string, kind: "email_start" | "email_verify_fail") =>
  db.insert(authAttempts).values({ key, kind, createdAt: Date.now() });

const recordFail = async (db: Db, email: string, ip: string) => {
  await recordAttempt(db, `email:${email}`, "email_verify_fail");
  await recordAttempt(db, `ip:${ip}`, "email_verify_fail");
};

/** Вхід і реєстрація одним кроком: надсилаємо код, нової пошти «неправильною» не буває. */
export const startEmailLogin = async (email: string, ip: string) => {
  if (mailMode() === "off") throw new AuthError(503, "Вхід ще не підключено", "Спробуйте трохи згодом.");
  const db = getDb();
  const keys = [`email:${email}`, `ip:${ip}`];
  for (const key of keys) {
    if ((await countAttempts(db, key, "email_start")) >= MAX_STARTS) {
      throw new AuthError(429, "Забагато спроб", "Спробуйте ще раз за пів години.", "/problems/rate-limited");
    }
  }
  for (const key of keys) await recordAttempt(db, key, "email_start");

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    const created = { id: crypto.randomUUID(), email, createdAt: Date.now() };
    await db.insert(users).values(created).onConflictDoNothing();
    [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  }

  // Новий лист не частіше разу на хвилину; відповідь клієнту та сама.
  const [last] = await db.select().from(emailCodes).where(eq(emailCodes.userId, user.id)).limit(1);
  if (last && Date.now() - last.createdAt < RESEND_GAP) return;

  const code = mailMode() === "dev" ? devCode().code : String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await db.delete(emailCodes).where(eq(emailCodes.userId, user.id));
  await db.insert(emailCodes).values({
    id: crypto.randomUUID(),
    userId: user.id,
    codeHash: await sha256(`${user.id}:${code}`),
    createdAt: Date.now(),
    expiresAt: Date.now() + CODE_TTL,
  });
  await sendLoginCode(email, code);
};

/** Код тестового входу: свій з DEV_LOGIN_CODE (секрет) або типовий 000000 для локальної розробки. */
export const devCode = (): { code: string; private: boolean } => {
  const custom = readVar("DEV_LOGIN_CODE");
  return custom && /^\d{4,8}$/.test(custom) ? { code: custom, private: true } : { code: MOCK_CODE, private: false };
};

const invalidCode = () => new AuthError(400, "Невірний код", "Невірний код. Спробуйте ще раз.", "/problems/invalid-code");

export const verifyEmailLogin = async (email: string, code: string, ip: string): Promise<SessionUser> => {
  if (mailMode() === "off") throw new AuthError(503, "Вхід ще не підключено", "Спробуйте трохи згодом.");
  const db = getDb();
  // Ліміт і за поштою, і за IP: інакше код підбирали б, міняючи пошту.
  for (const key of [`email:${email}`, `ip:${ip}`]) {
    if ((await countAttempts(db, key, "email_verify_fail")) >= MAX_FAILS) {
      throw new AuthError(429, "Забагато спроб", "Спробуйте ще раз за пів години.", "/problems/rate-limited");
    }
  }
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const [stored] = user ? await db.select().from(emailCodes).where(eq(emailCodes.userId, user.id)).limit(1) : [];
  if (!user || !stored || stored.expiresAt < Date.now() || stored.attempts >= MAX_CODE_TRIES) {
    await recordFail(db, email, ip);
    throw invalidCode();
  }
  if (!sameText(stored.codeHash, await sha256(`${user.id}:${code}`))) {
    await db.update(emailCodes).set({ attempts: stored.attempts + 1 }).where(eq(emailCodes.id, stored.id));
    await recordFail(db, email, ip);
    throw invalidCode();
  }
  await db.delete(emailCodes).where(eq(emailCodes.userId, user.id));
  await db
    .update(users)
    .set({ emailVerifiedAt: user.emailVerifiedAt ?? Date.now(), lastLoginAt: Date.now() })
    .where(eq(users.id, user.id));
  await openSession(user.id, "email");
  return toSessionUser(user, "email");
};

/** Вхід через Google: акаунт із такою поштою прив'язується, пошта вважається підтвердженою. */
export const loginWithGoogle = async (profile: { googleId: string; email: string; name: string | null; picture: string | null }) => {
  const db = getDb();
  const email = profile.email.trim().toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.googleId, profile.googleId)).limit(1);
  if (!user) [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    await db
      .insert(users)
      .values({ id: crypto.randomUUID(), email, googleId: profile.googleId, displayName: profile.name, avatarUrl: profile.picture, emailVerifiedAt: Date.now(), createdAt: Date.now() })
      .onConflictDoNothing();
    [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  } else {
    await db
      .update(users)
      .set({
        googleId: profile.googleId,
        emailVerifiedAt: user.emailVerifiedAt ?? Date.now(),
        displayName: user.displayName ?? profile.name,
        avatarUrl: user.avatarUrl ?? profile.picture,
        lastLoginAt: Date.now(),
      })
      .where(eq(users.id, user.id));
  }
  await openSession(user.id, "google");
  return toSessionUser(user, "google");
};

const openSession = async (userId: string, via: SessionUser["via"]) => {
  const db = getDb();
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.insert(sessions).values({ id, userId, via, createdAt: now, expiresAt: now + SESSION_TTL, lastSeenAt: now });
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(id)
    .setExpirationTime(Math.floor((now + SESSION_TTL) / 1000))
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: SESSION_TTL / 1000,
  });
};

/** Хто увійшов. Токен без живого рядка в `sessions`, прострочений або неактивний 14 днів — гість. */
export const getSessionUser = async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.jti || !payload.sub) return null;
    const db = getDb();
    const [row] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, payload.jti))
      .limit(1);
    const now = Date.now();
    if (!row || row.user.id !== payload.sub || row.session.expiresAt < now || now - row.session.lastSeenAt > IDLE_TTL) return null;
    // lastSeenAt пишемо не частіше разу на добу: менше записів у базу.
    if (now - row.session.lastSeenAt > DAY) await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
    return toSessionUser(row.user, row.session.via);
  } catch {
    return null;
  }
};

export const closeSession = async () => {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  store.delete(COOKIE);
  if (!token) return;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.jti) await getDb().delete(sessions).where(eq(sessions.id, payload.jti));
  } catch {
    // Токен і так недійсний.
  }
};

/** Для роутів, яким потрібен вхід: без сесії кидає 401. */
export const requireApiUser = async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "Потрібен вхід", "Підтвердьте пошту, щоб продовжити.");
  return user;
};
