// lib/server/legal-repo.ts
//
// Згоди користувача з правовими документами (таблиця legal_acceptances). Чиста логіка (що потрібне, що прийнято)
// у lib/legal/acceptance.ts; тут лише база. Сирого IP не пишемо: хеш із сіллю телеметрії.

import { eq, sql } from "drizzle-orm";
import { hashIp } from "@/kit/telemetry/core";
import { legalAcceptances, users } from "@/db/schema";
import { isAccepted, isLegalDoc, pendingDocs, sourceFor, type AcceptanceSource, type LatestAccepted, type LegalDoc, type LegalVersions, type PendingDoc } from "@/lib/legal/acceptance";
import { LEGAL_VERSIONS } from "@/lib/legal/config";
import { telemetrySalt } from "@/lib/telemetry/salt";
import { getDb } from "./db";

/** Найновіша прийнята версія кожного документа. */
export const latestAccepted = async (userId: string): Promise<LatestAccepted> => {
  const rows = await getDb()
    .select({ doc: legalAcceptances.doc, version: sql<string>`max(${legalAcceptances.version})` })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.userId, userId))
    .groupBy(legalAcceptances.doc);
  const latest: LatestAccepted = {};
  for (const row of rows) if (isLegalDoc(row.doc)) latest[row.doc] = row.version;
  return latest;
};

/** Записує згоду з чинними версіями. Повторне прийняття тієї самої версії рядка не додає. */
export const recordAcceptance = async (input: { userId: string; docs: readonly LegalDoc[]; source?: AcceptanceSource; ip?: string; versions?: LegalVersions }): Promise<void> => {
  const { userId, docs, ip, versions = LEGAL_VERSIONS } = input;
  if (docs.length === 0) return;
  const ipHash = ip ? await hashIp(ip, telemetrySalt()) : null;
  const now = Date.now();
  await getDb()
    .insert(legalAcceptances)
    .values(docs.map((doc) => ({ id: crypto.randomUUID(), userId, doc, version: versions[doc], acceptedAt: now, source: input.source ?? sourceFor(doc), ipHash })))
    .onConflictDoNothing();
};

/** Документи для грошових дій, які ця людина ще не приймала в чинній версії. */
export const pendingFor = async (userId: string, versions: LegalVersions = LEGAL_VERSIONS): Promise<PendingDoc[]> => pendingDocs(await latestAccepted(userId), { versions });

/** Чи прийнято ризик крипти чинної версії. */
export const riskAccepted = async (userId: string, versions: LegalVersions = LEGAL_VERSIONS): Promise<boolean> => isAccepted(await latestAccepted(userId), "cryptoRisk", versions);

/**
 * Чи треба взяти згоду при вході: акаунта ще немає або чинні умови не прийняті. Шукаємо за поштою й, якщо є, за Google id,
 * бо акаунт Google може вже існувати під іншою поштою.
 */
export const needsTermsAcceptance = async (who: { email: string; googleId?: string }): Promise<boolean> => {
  const db = getDb();
  let [user] = who.googleId ? await db.select({ id: users.id }).from(users).where(eq(users.googleId, who.googleId)).limit(1) : [];
  if (!user) [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, who.email)).limit(1);
  if (!user) return true;
  return (await pendingFor(user.id)).length > 0;
};
