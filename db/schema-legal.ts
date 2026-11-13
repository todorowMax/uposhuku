// db/schema-legal.ts
//
// Згоди користувача з правовими документами. Окремий файл, щоб db/schema.ts не росло; схема експортується
// з db/schema.ts, тож drizzle й решта коду бачать її як одну.

import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

/**
 * Один рядок на (користувач, документ, версія): повторне прийняття тієї самої версії нового рядка не дає.
 * `ip_hash` це хеш IP з сіллю телеметрії, сирого IP не зберігаємо. `source`: `signup` (вхід), `reaccept`
 * (оновлені умови), `payment_risk` (ризик крипти перед першою дією з USDT).
 */
export const legalAcceptances = sqliteTable(
  "legal_acceptances",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    doc: text("doc").notNull(),
    version: text("version").notNull(),
    acceptedAt: integer("accepted_at").notNull(),
    source: text("source", { enum: ["signup", "reaccept", "payment_risk"] }).notNull(),
    ipHash: text("ip_hash"),
  },
  (table) => [uniqueIndex("legal_acceptances_user_doc_version_idx").on(table.userId, table.doc, table.version)],
);
