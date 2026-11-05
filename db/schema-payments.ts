// db/schema-payments.ts
//
// Таблиці платежів безпечної угоди: платіж за етап, оброблені події вебхука й рахунки
// виконавців у провайдерів. Окремий файл, щоб db/schema.ts не перевищував ліміт рядків;
// схема експортується з db/schema.ts, тож drizzle й решта коду бачать її як одну.
// Посилання на users і deals ліниві (стрілки), тому цикл імпортів безпечний.

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { deals, users } from "./schema";

/**
 * Платіж за етап безпечної угоди: рахунок у провайдера (Monobank), його стан і корзина,
 * з якої ми фіналізуємо й повертаємо гроші частинами (lib/deals/basket.ts). Суми в копійках.
 * `card` — тип картки, який обрав замовник (від нього залежить комісія банку в сумі).
 */
export const dealPayments = sqliteTable(
  "deal_payments",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    stageId: text("stage_id").notNull(),
    provider: text("provider").notNull(),
    invoiceId: text("invoice_id").notNull(),
    status: text("status").notNull(),
    card: text("card").notNull(),
    amount: integer("amount").notNull(),
    finalAmount: integer("final_amount"),
    pageUrl: text("page_url").notNull(),
    basket: text("basket").notNull(),
    /** modifiedDate банку з останньої прийнятої події: старішу ігноруємо, щоб запізнілий вебхук не відкотив статус. */
    modifiedDate: text("modified_date"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("deal_payments_invoice_idx").on(table.provider, table.invoiceId),
    index("deal_payments_stage_idx").on(table.dealId, table.stageId),
    // Не більше одного «живого» рахунку на етап: друга одночасна оплата впирається в цей індекс, а не створює другий рахунок.
    uniqueIndex("deal_payments_live_stage_idx")
      .on(table.dealId, table.stageId)
      .where(sql`${table.status} in ('creating', 'created', 'processing', 'hold', 'success')`),
  ],
);

/** Оброблені події вебхуків провайдера: id події не обробляємо вдруге (банк повторює непідтверджене до 3 разів). */
export const paymentEvents = sqliteTable("payment_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  createdAt: integer("created_at").notNull(),
});

/**
 * Як виконавець отримує гроші за безпечну угоду. Monobank: ФОП зі рахунком у mono, `receiver_id` —
 * splitReceiverId зі списку банку, `tax_id` — ІПН, за яким його знайшли. UAPAY: картка, зареєстрована
 * в UAPAY (id картки). Один запис на користувача й провайдера.
 */
export const payoutAccounts = sqliteTable(
  "payout_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** Monobank: ІПН ФОП, зашифрований (secret-box, aad = id користувача). Відкритого ІПН у базі немає. */
    taxId: text("tax_id"),
    /** Маска ІПН для екрана й списку заявок. */
    taxIdMask: text("tax_id_mask"),
    /** Назва ФОП, як її вказав виконавець. */
    fopName: text("fop_name"),
    receiverId: text("receiver_id"),
    status: text("status").notNull(),
    /** Коли виконавець погодився з офертою безпечної угоди й підтвердив рахунок ФОП у mono. */
    consentAt: integer("consent_at"),
    accountConfirmedAt: integer("account_confirmed_at"),
    /** Остання перевірка в банку (адміністратор). */
    checkedAt: integer("checked_at"),
    /** Причина відхилення чи відключення: її бачить виконавець і може подати заявку знову. */
    rejectReason: text("reject_reason"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("payout_accounts_user_provider_idx").on(table.userId, table.provider)],
);

/**
 * Рахунок Monobank за розміщення на карті (звичайний, без холду й розщеплення). Оплату в `payments`
 * зараховує лише `success` цього рахунку, рівно раз. `modifiedDate` — рядок банку з останньої
 * прийнятої події: старішу подію ігноруємо, щоб запізнілий вебхук не відкотив статус. Сума в гривнях.
 */
export const placementInvoices = sqliteTable(
  "placement_invoices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull(),
    modifiedDate: text("modified_date"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("placement_invoices_invoice_idx").on(table.invoiceId), index("placement_invoices_user_idx").on(table.userId)],
);

/**
 * Реквізити виконавця для прямого переказу. Лише шифротекст (lib/server/secret-box.ts, aad = id користувача)
 * і маска IBAN для показу. Зміна не діє одразу: нові значення чекають у `pending_*` до `pending_at`
 * (24 години), тоді стають поточними при найближчому читанні.
 */
export const payoutRequisites = sqliteTable("payout_requisites", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  cipher: text("cipher").notNull(),
  mask: text("mask").notNull(),
  pendingCipher: text("pending_cipher"),
  pendingMask: text("pending_mask"),
  pendingAt: integer("pending_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Знімок реквізитів у момент прийняття угоди: замовник бачить його, а не поточні реквізити виконавця. */
export const dealRequisites = sqliteTable("deal_requisites", {
  dealId: text("deal_id")
    .primaryKey()
    .references(() => deals.id, { onDelete: "cascade" }),
  cipher: text("cipher").notNull(),
  mask: text("mask").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Журнал: хто й коли відкривав реквізити угоди (лише замовник). */
export const requisiteReads = sqliteTable(
  "requisite_reads",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    readerUserId: text("reader_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("requisite_reads_deal_idx").on(table.dealId, table.createdAt)],
);

/**
 * Код з пошти для приймання етапу від 10 000 ₴ (RELEASE_CODE_FROM). У базі лише SHA-256 від
 * `userId:dealId:stageId:код`; одна чинна пара на замовника й етап, 5 спроб, 10 хвилин.
 */
export const dealReleaseCodes = sqliteTable(
  "deal_release_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dealId: text("deal_id").notNull(),
    stageId: text("stage_id").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [uniqueIndex("deal_release_codes_stage_idx").on(table.userId, table.dealId, table.stageId)],
);

/**
 * Останній прийнятий крок TOTP кожного адміністратора. Код іде в справу лише раз: той самий чи старіший
 * за збережений крок відхиляється, тож підглянутий код не повторити в межах вікна.
 */
export const adminTotpState = sqliteTable("admin_totp_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastCounter: integer("last_counter").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Прапорці функцій, змінені в адмінці: режим (off | allowlist | on) і пошти через кому. Рядок важливіший за
 * змінні середовища; без рядка діють змінні, без них функція вимкнена. Хто й коли змінив, лишається в рядку.
 */
export const featureFlags = sqliteTable("feature_flags", {
  feature: text("feature").primaryKey(),
  mode: text("mode").notNull(),
  users: text("users").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Підтверджена оплата USDT TRC-20 за хешем транзакції для етапу прямої угоди. Один хеш рахується лише раз
 * (унікальний індекс). Сума в мінімальних одиницях токена (6 знаків) рядком, щоб не втратити точність.
 */
export const cryptoProofs = sqliteTable(
  "crypto_proofs",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    stageId: text("stage_id").notNull(),
    txHash: text("tx_hash").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    amountUnits: text("amount_units").notNull(),
    confirmations: integer("confirmations").notNull(),
    blockTime: integer("block_time").notNull(),
    /** Мережа оплати: tron (TRC-20 за хешем) або evm (гаманець, мережа з CRYPTO_CHAIN_ID). */
    chain: text("chain").notNull().default("tron"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("crypto_proofs_hash_idx").on(table.txHash), index("crypto_proofs_deal_idx").on(table.dealId)],
);

/** Одноразові запити на підпис: людина доводить, що адреса гаманця її. Використаний або прострочений запит не діє. */
export const walletChallenges = sqliteTable(
  "wallet_challenges",
  {
    nonce: text("nonce").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    domain: text("domain").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
  },
  (table) => [index("wallet_challenges_user_idx").on(table.userId, table.createdAt)],
);
