// db/schema.ts
//
// Схема D1. Часові позначки — мілісекунди Unix (integer), id — рядки
// (UUID), щоб не залежати від автоінкременту при переїзді між базами.
// Таблиці входу: users, sessions, email_codes, auth_attempts
// (docs/plan-mvp.md, «Фундамент»).

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerifiedAt: integer("email_verified_at"),
  googleId: text("google_id").unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at").notNull(),
  lastLoginAt: integer("last_login_at"),
});

/** `id` — це jti токена: без рядка в цій таблиці токен недійсний, тож вихід спрацьовує одразу. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    via: text("via", { enum: ["email", "google"] }).notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

/** Лише SHA-256 від `userId:код`; одна чинна пара на користувача. */
export const emailCodes = sqliteTable(
  "email_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("email_codes_user_idx").on(table.userId)],
);

/** Ліміти спроб у базі, а не в пам'яті воркера: ізоляти не діляться станом. */
export const authAttempts = sqliteTable(
  "auth_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Що лімітуємо: пошта чи IP. */
    key: text("key").notNull(),
    kind: text("kind", { enum: ["email_start", "email_verify_fail"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("auth_attempts_lookup_idx").on(table.key, table.kind, table.createdAt)],
);
