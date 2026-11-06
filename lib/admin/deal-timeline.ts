// lib/admin/deal-timeline.ts
//
// Хронологія угоди для модератора: усі відмітки часу в одному списку, а під нею факти без часу (критерії, маска
// реквізитів знімка). Чиста функція: усе потрібне передає виклик, сама нічого не читає.

import { METHOD_LABEL as DEAL_METHOD_LABEL } from "@/lib/admin/format";
import { COMPLAINT_REASON_LABEL, type ComplaintReason } from "@/lib/deals/complaints";
import { METHOD_LABEL } from "@/lib/deals/requisites";
import type { Deal, DealStage } from "@/lib/deals/types";

export interface TimelineProof {
  stageId: string;
  txHash: string;
  /** Коли транзакцію записано в блокчейні (мс). */
  at: number;
  /** Посилання на оглядач мережі; немає, коли мережу не знаємо. */
  explorerUrl: string | null;
}

export interface TimelineComplaint {
  id: string;
  side: "customer" | "performer";
  reason: ComplaintReason;
  createdAt: number;
  closedAt: number | null;
}

export interface TimelineInput {
  deal: Deal;
  proofs: TimelineProof[];
  complaints: TimelineComplaint[];
  /** Маска реквізитів знімка угоди (сам знімок не показуємо). */
  snapshotMask: string | null;
  /** Адреси чеків за етапами: як їх відкриває модератор. */
  receiptUrls: Record<string, string>;
}

export interface TimelineEvent {
  at: string;
  label: string;
  detail?: string;
  /** Посилання; зовнішні відкриваємо з rel="noopener noreferrer". */
  href?: string;
  external?: boolean;
}

export interface TimelineNote {
  label: string;
  value: string;
}

export interface DealTimeline {
  events: TimelineEvent[];
  notes: TimelineNote[];
}

const SIDE_LABEL = { customer: "замовник", performer: "виконавець" } as const;
const iso = (ms: number) => new Date(ms).toISOString();

const stageEvents = (deal: Deal, stage: DealStage, input: TimelineInput): TimelineEvent[] => {
  const where = deal.stages.length > 1 ? ` (етап «${stage.title}»)` : "";
  const events: (TimelineEvent | null)[] = [
    stage.claimedAt ? { at: stage.claimedAt, label: `Замовник позначив оплату${where}`, detail: stage.paidVia ? `Спосіб: ${METHOD_LABEL[stage.paidVia]}` : undefined } : null,
    stage.receiptAt && stage.receiptAttachmentId ? { at: stage.receiptAt, label: `Замовник додав чек${where}`, href: input.receiptUrls[stage.id] } : null,
    ...input.proofs.filter((proof) => proof.stageId === stage.id).map((proof): TimelineEvent => ({ at: iso(proof.at), label: `Транзакцію USDT знайдено в мережі${where}`, detail: proof.txHash, href: proof.explorerUrl ?? undefined, external: true })),
    stage.fundedAt ? { at: stage.fundedAt, label: `Оплату підтверджено${where}` } : null,
    stage.deliveredAt ? deliveredEvent(stage, where) : null,
    stage.reworkAt ? { at: stage.reworkAt, label: `Модератор повернув на доопрацювання${where}` } : null,
    stage.disputedAt ? { at: stage.disputedAt, label: `Відкрито спір${where}` } : null,
    stage.releasedAt ? { at: stage.releasedAt, label: `${deal.method === "direct" ? "Роботу прийнято" : "Етап виплачено"}${where}` } : null,
    stage.refundedAt ? { at: stage.refundedAt, label: `Кошти повернено замовнику${where}` } : null,
  ];
  return events.filter((event): event is TimelineEvent => event !== null);
};

const deliveredEvent = (stage: DealStage, where: string): TimelineEvent => {
  const { text, link } = stage.delivery ?? {};
  return { at: stage.deliveredAt ?? "", label: `Виконавець здав етап${where}`, detail: text, href: link, external: Boolean(link) };
};

export const dealTimeline = (input: TimelineInput): DealTimeline => {
  const { deal } = input;
  const events: TimelineEvent[] = [
    { at: deal.createdAt, label: `Умови виставив${deal.proposedBy === "performer" ? " виконавець" : " замовник"}`, detail: `Угода ${deal.number}, ${DEAL_METHOD_LABEL[deal.method]}` },
    ...(deal.acceptedAt ? [{ at: deal.acceptedAt, label: "Умови прийнято" }] : []),
    ...deal.stages.flatMap((stage) => stageEvents(deal, stage, input)),
    ...input.complaints.flatMap((complaint): TimelineEvent[] => [
      { at: iso(complaint.createdAt), label: `Скарга: ${SIDE_LABEL[complaint.side]}`, detail: COMPLAINT_REASON_LABEL[complaint.reason] },
      ...(complaint.closedAt ? [{ at: iso(complaint.closedAt), label: "Скаргу закрито модератором" }] : []),
    ]),
  ];
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const notes: TimelineNote[] = [
    ...(deal.criteria ? [{ label: "Що вважаємо готовим", value: deal.criteria }] : [{ label: "Що вважаємо готовим", value: "не вказано" }]),
    ...(input.snapshotMask ? [{ label: "Реквізити виконавця на момент прийняття (маска)", value: input.snapshotMask }] : []),
  ];
  return { events, notes };
};
