// lib/legal/acceptance.ts
//
// Чиста логіка згод: які документи відомі, які з них потрібні для грошових дій, що вважається прийнятим і як
// читати запит «Приймаю». Версії лежать у lib/legal/config.ts, база й відповіді в lib/server/legal-*.ts.

import { LEGAL_VERSIONS } from "./config";

export const LEGAL_DOCS = ["terms", "privacy", "offer", "safeDealOffer", "cryptoRisk"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];
export type LegalVersions = Record<LegalDoc, string>;
export type AcceptanceSource = "signup" | "reaccept" | "payment_risk";

/** Що людина приймає при вході й що вимагається для грошових дій. Оферту й ризик крипти приймають окремо, в момент дії. */
export const REQUIRED_DOCS: readonly LegalDoc[] = ["terms", "privacy"];

/** Найновіша прийнята версія за документом. */
export type LatestAccepted = Partial<Record<LegalDoc, string>>;

export interface PendingDoc {
  doc: LegalDoc;
  version: string;
}

export const isLegalDoc = (value: unknown): value is LegalDoc => LEGAL_DOCS.some((doc) => doc === value);

/** Прийнято, якщо найновіша прийнята версія не старіша за чинну (рядки дат порівнюються як текст). */
export const isAccepted = (latest: LatestAccepted, doc: LegalDoc, versions: LegalVersions = LEGAL_VERSIONS): boolean => (latest[doc] ?? "") >= versions[doc];

/** Документи з переліку, чинної версії яких людина ще не приймала. */
export const pendingDocs = (latest: LatestAccepted, options: { docs?: readonly LegalDoc[]; versions?: LegalVersions } = {}): PendingDoc[] => {
  const { docs = REQUIRED_DOCS, versions = LEGAL_VERSIONS } = options;
  return docs.filter((doc) => !isAccepted(latest, doc, versions)).map((doc) => ({ doc, version: versions[doc] }));
};

/** Звідки згода: ризик крипти належить до оплати, решта до повторного прийняття. Вхід ставить `signup` сам. */
export const sourceFor = (doc: LegalDoc): AcceptanceSource => (doc === "cryptoRisk" ? "payment_risk" : "reaccept");

export type AcceptRequest = { ok: true; docs: LegalDoc[] } | { ok: false; status: 400 | 409; error: string };

/** Тіло POST /api/legal/accept: `{ docs: [{ doc, version }] }`. Лише відомі документи й лише чинні версії. */
export const readAcceptRequest = (body: unknown, versions: LegalVersions = LEGAL_VERSIONS): AcceptRequest => {
  const list = body && typeof body === "object" ? (body as { docs?: unknown }).docs : undefined;
  if (!Array.isArray(list) || list.length === 0 || list.length > LEGAL_DOCS.length) return { ok: false, status: 400, error: "Не вказано, що приймаєте." };
  const docs: LegalDoc[] = [];
  for (const item of list as unknown[]) {
    const entry = item && typeof item === "object" ? (item as { doc?: unknown; version?: unknown }) : {};
    if (!isLegalDoc(entry.doc)) return { ok: false, status: 400, error: "Невідомий документ." };
    if (entry.version !== versions[entry.doc]) return { ok: false, status: 409, error: "Текст оновився. Відкрийте його ще раз і прийміть чинну версію." };
    if (!docs.includes(entry.doc)) docs.push(entry.doc);
  }
  return { ok: true, docs };
};
