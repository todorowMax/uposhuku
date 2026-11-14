import { describe, expect, it } from "vitest";
import { offerStatus } from "@/lib/requests/offer-status";
import type { ConversationDto } from "@/lib/chat/types";
import type { Deal, DealStage } from "@/lib/deals/types";

const offer = { id: "resp_req_1_u1", performerId: "me-u1" };

const stage = (status: DealStage["status"]) => ({ id: "s1", title: "Етап", amount: 1000, days: 3, status }) as DealStage;
const deal = (extra: Partial<Deal> = {}) =>
  ({ id: "deal_1", requestId: "req_1", responseId: offer.id, performer: { id: offer.performerId }, method: "direct", status: "accepted", stages: [stage("pending")], number: "#A1B2", createdAt: "2026-11-14T10:00:00.000Z", ...extra }) as Deal;
const chat = (extra: Partial<ConversationDto> = {}) => ({ id: "conv_1", performerId: offer.performerId, role: "customer", phase: "chat", talked: true, ...extra }) as ConversationDto;

describe("стан картки пропозиції", () => {
  it("немає ні розмови, ні угоди: можна написати й відхилити", () => {
    expect(offerStatus(offer, [], [])).toEqual({ kind: "new" });
  });

  it("розмови з іншими виконавцями й розмова, де я виконавець, не рахуються", () => {
    expect(offerStatus(offer, [], [chat({ performerId: "me-u2" }), chat({ role: "performer" })])).toEqual({ kind: "new" });
  });

  it("розмова з самих системних рядків («Відгук на…») ще не чат", () => {
    expect(offerStatus(offer, [], [chat({ talked: false })])).toEqual({ kind: "new" });
  });

  it("є розмова з цим виконавцем: «Чат відкрито»", () => {
    expect(offerStatus(offer, [], [chat()])).toEqual({ kind: "chat" });
  });

  it("є угода: номер і статус людською мовою, відхилити не можна", () => {
    expect(offerStatus(offer, [deal()], [chat()])).toEqual({ kind: "deal", label: "Угода #A1B2 · Очікує оплати" });
  });

  it("статус угоди йде за етапом і станом", () => {
    const label = (extra: Partial<Deal>) => (offerStatus(offer, [deal(extra)], []) as { label: string }).label;
    expect(label({ stages: [stage("funded")] })).toBe("Угода #A1B2 · В роботі");
    expect(label({ stages: [stage("delivered")] })).toBe("Угода #A1B2 · Здано, чекає вашого підтвердження");
    expect(label({ status: "completed", stages: [stage("released")] })).toBe("Угода #A1B2 · Завершено");
    expect(label({ status: "proposed", proposedBy: "customer" })).toBe("Угода #A1B2 · Чекаємо відповіді");
  });

  it("відхилена чи скасована угода не рахується: лишається чат або «нова»", () => {
    expect(offerStatus(offer, [deal({ status: "declined" })], [])).toEqual({ kind: "new" });
    expect(offerStatus(offer, [deal({ status: "cancelled" })], [chat()])).toEqual({ kind: "chat" });
  });

  it("угода чужого відгуку не підходить", () => {
    expect(offerStatus(offer, [deal({ responseId: "resp_req_1_u2" })], [])).toEqual({ kind: "new" });
  });
});
