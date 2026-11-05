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
    taxId: text("tax_id"),
    receiverId: text("receiver_id"),
    status: text("status").notNull(),
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
