// db/schema.ts
//
// Схема D1. Часові позначки — мілісекунди Unix (integer), id — рядки
// (UUID), щоб не залежати від автоінкременту при переїзді між базами.
// Таблиці входу: users, sessions, email_codes, auth_attempts
// (docs/plan-mvp.md, «Фундамент»).

import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

// ───────────── профілі ─────────────

/** Один профіль виконавця на користувача. Фото поки data URL (JPEG ~200 КБ), потім R2. */
export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  cityId: text("city_id").notNull().default(""),
  lat: real("lat"),
  lng: real("lng"),
  specialty: text("specialty").notNull().default(""),
  bio: text("bio").notNull().default(""),
  photo: text("photo").notNull().default(""),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at").notNull(),
});

/** Заявлені теги профілю (з «Про себе» і спеціальності). */
export const profileTags = sqliteTable(
  "profile_tags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tagId] }), index("profile_tags_tag_idx").on(table.tagId)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    url: text("url").notNull().default(""),
  },
  (table) => [index("projects_user_idx").on(table.userId)],
);

/** Підтверджені теги: ті, що розпізнані з опису проєкту. */
export const projectTags = sqliteTable(
  "project_tags",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.tagId] })],
);

// ───────────── запити й відгуки ─────────────

export const requests = sqliteTable(
  "requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    budget: integer("budget"),
    deadline: text("deadline"),
    cityId: text("city_id"),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("requests_user_idx").on(table.userId), index("requests_status_idx").on(table.status, table.createdAt)],
);

export const requestTags = sqliteTable(
  "request_tags",
  {
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull(),
    /** Назва поруч, щоб «Мої запити» не вантажили словник тегів. */
    label: text("label").notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.tagId] })],
);

/** Файли запиту: поки лише опис (R2 ще немає). */
export const requestFiles = sqliteTable(
  "request_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    type: text("type").notNull().default(""),
  },
  (table) => [index("request_files_request_idx").on(table.requestId)],
);

/** Відгук виконавця (справжнього акаунта) на запит: один на пару. */
export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    performerUserId: text("performer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    price: integer("price"),
    days: integer("days").notNull(),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("responses_pair_idx").on(table.requestId, table.performerUserId), index("responses_performer_idx").on(table.performerUserId)],
);

// ───────────── гроші ─────────────

/** Оплати розміщення. Рівень не зберігаємо: його щоразу рахує сервер за сумами всіх платників. */
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    tierAfter: integer("tier_after").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("payments_user_idx").on(table.userId)],
);

/**
 * Угода — документ: машина станів (lib/deals/machine.ts) працює з усім об'єктом
 * разом з етапами, тож зберігаємо його JSON-ом, а для вибірок виносимо колонки.
 */
export const deals = sqliteTable(
  "deals",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    responseId: text("response_id").notNull(),
    performerId: text("performer_id").notNull(),
    status: text("status").notNull(),
    data: text("data").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("deals_owner_idx").on(table.ownerUserId, table.requestId)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    performerId: text("performer_id").notNull(),
    dealId: text("deal_id").notNull(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
    text: text("text").notNull().default(""),
    author: text("author").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("reviews_deal_idx").on(table.dealId), index("reviews_performer_idx").on(table.performerId)],
);

// ───────────── чат ─────────────

/** Розмова замовника з виконавцем: одна на пару. performerId — `me-<userId>` або демо-id. */
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    customerUserId: text("customer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    performerId: text("performer_id").notNull(),
    /** Користувач-виконавець; null для демо-виконавців. */
    performerUserId: text("performer_user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("conversations_pair_idx").on(table.customerUserId, table.performerId),
    index("conversations_performer_user_idx").on(table.performerUserId),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    from: text("from", { enum: ["customer", "performer"] }).notNull(),
    text: text("text").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("messages_conversation_idx").on(table.conversationId, table.createdAt)],
);
