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
    /** Звідки тег: знайдений у тексті, доданий вручну чи прибраний людиною (hidden не показуємо нікому). */
    source: text("source", { enum: ["auto", "manual", "hidden"] }).notNull().default("auto"),
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
    source: text("source", { enum: ["auto", "manual", "hidden"] }).notNull().default("auto"),
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
    /** Можна показати запит у публічному Telegram-каналі (без контактів, з відгуком лише на платформі). */
    channelOptIn: integer("channel_opt_in", { mode: "boolean" }).notNull().default(true),
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

/**
 * Журнал рішень модератора у спорах: хто, коли, що вирішив і чому. Лише дописуємо;
 * пошту зберігаємо копією, щоб запис читався й після зміни списку адміністраторів.
 */
export const moderationActions = sqliteTable(
  "moderation_actions",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id").notNull(),
    stageId: text("stage_id").notNull(),
    action: text("action", { enum: ["release", "refund", "rework"] }).notNull(),
    comment: text("comment").notNull(),
    adminUserId: text("admin_user_id").notNull(),
    adminEmail: text("admin_email").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("moderation_actions_deal_idx").on(table.dealId, table.createdAt)],
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
    /** text — репліка людини; system — подія в стрічці («Угоду запропоновано»). */
    kind: text("kind", { enum: ["text", "system"] }).notNull().default("text"),
    /** Про що повідомлення: id угоди чи запиту. Лише мітка в стрічці, окремих розмов не створює. */
    contextId: text("context_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("messages_conversation_idx").on(table.conversationId, table.createdAt)],
);

/**
 * Фото в чаті. Лежать у R2 під приватним префіксом chat/<розмова>/, віддаються лише
 * учасникам. `messageId` порожній, доки фото не прикріплено до надісланого повідомлення:
 * такі «осиротілі» старші за добу прибираємо при наступному завантаженні в розмову.
 */
export const chatAttachments = sqliteTable(
  "chat_attachments",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    uploaderUserId: text("uploader_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("chat_attachments_conversation_idx").on(table.conversationId), index("chat_attachments_message_idx").on(table.messageId)],
);

// ───────────── присутність ─────────────

/**
 * Хто зараз на сайті: Durable Object (worker/realtime.ts) пише сюди, коли
 * відкривається й закривається сокет, і оновлює `last_seen` пульсом. Онлайн
 * лише якщо `online` і пульс свіжий: так нічия обірвана вкладка не висить вічно.
 */
export const presence = sqliteTable("presence", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  online: integer("online", { mode: "boolean" }).notNull().default(false),
  lastSeen: integer("last_seen").notNull(),
});

// ───────────── теги, яких немає в словнику ─────────────

/**
 * Пропозиція тегу від людини, коли пошук нічого не знайшов. Одна пропозиція
 * на фразу (за основами слів), а хто саме просив, лежить у tag_proposal_uses.
 * Тег не бере участі в підборі, доки ми його не додамо до словника в коді
 * (scripts/tags-resolve.ts закриває пропозицію й додає тег усім, хто просив).
 */
export const tagProposals = sqliteTable(
  "tag_proposals",
  {
    id: text("id").primaryKey(),
    /** Фраза після нормалізації й зведення слів до основ (lib/tags/detect.ts → phraseKey). */
    phraseKey: text("phrase_key").notNull(),
    /** Як написала перша людина. */
    text: text("text").notNull(),
    status: text("status", { enum: ["new", "added", "mapped", "rejected"] }).notNull().default("new"),
    /** Який тег словника закрив пропозицію (новий або наявний, якщо це був синонім). */
    resolvedTagId: text("resolved_tag_id"),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("tag_proposals_key_idx").on(table.phraseKey), index("tag_proposals_status_idx").on(table.status, table.createdAt)]
);

/** Хто й де просив тег: профіль, робота або запит. `entity_id` — id роботи чи запиту, для профілю порожній. */
export const tagProposalUses = sqliteTable(
  "tag_proposal_uses",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references(() => tagProposals.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    context: text("context", { enum: ["profile", "work", "request"] }).notNull(),
    entityId: text("entity_id").notNull().default(""),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.proposalId, table.userId, table.context, table.entityId] }), index("tag_proposal_uses_user_idx").on(table.userId, table.createdAt)]
);

/**
 * Слова із запитів замовників, яких словник не знає: лічильник без прив'язки
 * до людини чи запиту. Сигнал попиту: що люди пишуть, а ми не розпізнаємо.
 */
export const tagTermStats = sqliteTable(
  "tag_term_stats",
  {
    termKey: text("term_key").primaryKey(),
    sample: text("sample").notNull(),
    requests: integer("requests").notNull().default(1),
    firstSeen: integer("first_seen").notNull(),
    lastSeen: integer("last_seen").notNull(),
  },
  (table) => [index("tag_term_stats_seen_idx").on(table.lastSeen)]
);

// ───────────── Telegram і сповіщення ─────────────

/** Оновлення Telegram, які вже обробили: вебхук можуть повторити, а ми не відповідаємо двічі. */
export const telegramUpdates = sqliteTable("telegram_updates", {
  updateId: integer("update_id").primaryKey(),
  receivedAt: integer("received_at").notNull(),
});

/** Прив'язка акаунта до приватного чату з ботом: один Telegram — один акаунт. */
export const telegramLinks = sqliteTable("telegram_links", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Текстом: id чатів бувають понад 2^31, а для каналів ще й від'ємні. */
  chatId: text("chat_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  /** Вимкнено, коли людина написала /stop, відключила бота на сайті чи заблокувала його. */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  linkedAt: integer("linked_at").notNull(),
  blockedAt: integer("blocked_at"),
});

/** Одноразові токени прив'язки: у базі лише хеш, живуть 15 хвилин. */
export const telegramLinkTokens = sqliteTable(
  "telegram_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
  },
  (table) => [index("telegram_link_tokens_user_idx").on(table.userId)]
);

/** Що людина хоче отримувати й де (lib/notification-prefs.ts описує форму JSON). */
export const notificationPreferences = sqliteTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  prefs: text("prefs").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Що вже надіслали: ключ не дає повторити те саме й тримає частоту (lib/server/notify.ts). */
export const notificationLog = sqliteTable(
  "notification_log",
  {
    key: text("key").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("notification_log_user_idx").on(table.userId, table.kind, table.createdAt)]
);

/** Пости запитів у публічному каналі. */
export const channelPosts = sqliteTable(
  "channel_posts",
  {
    requestId: text("request_id")
      .primaryKey()
      .references(() => requests.id, { onDelete: "cascade" }),
    chatId: text("chat_id").notNull(),
    messageId: integer("message_id"),
    status: text("status", { enum: ["posted", "closed", "failed"] }).notNull(),
    postedAt: integer("posted_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    error: text("error"),
  },
  (table) => [index("channel_posts_status_idx").on(table.status, table.postedAt)]
);
