import { describe, expect, it } from "vitest";
import { createDeal } from "@/lib/deals/machine";
import { payReminderDue, PAY_REMINDER_DAYS } from "@/lib/deals/pay-reminders";
import type { Deal, DealMethod, DealStage } from "@/lib/deals/types";
import { renderNoticeMail } from "@/lib/server/mail";
import { payReminderNotice } from "@/lib/telegram/notices";

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-01T10:00:00Z");
const performer = { id: "me-p1", name: "Юлія", avatarIndex: 1, specialty: "", fop: false };
const stages = [
  { title: "Макет", amount: 1000, days: 5 },
  { title: "Верстка", amount: 1000, days: 5 },
];

const deal = (method: DealMethod = "direct", patch: Partial<Deal> = {}): Deal => ({
  ...createDeal("deal_a1", { requestId: "r", responseId: "x", performer, method, stages }, T0),
  status: "accepted",
  acceptedAt: new Date(T0).toISOString(),
  ...patch,
});
const withStage = (source: Deal, index: number, patch: Partial<DealStage>): Deal => ({ ...source, stages: source.stages.map((stage, at) => (at === index ? { ...stage, ...patch } : stage)) });

describe("payReminderDue", () => {
  it("тиждень після прийняття: pending і claimed отримують перше нагадування, раніше нічого", () => {
    expect(payReminderDue(deal(), T0 + 7 * DAY - 1)).toBeNull();
    expect(payReminderDue(deal(), T0 + 7 * DAY)).toEqual({ stageId: "deal_a1-s1", number: 1 });
    expect(payReminderDue(withStage(deal(), 0, { status: "claimed" }), T0 + 8 * DAY)).toEqual({ stageId: "deal_a1-s1", number: 1 });
  });

  it("оплату відмічено (funded і далі), чужі способи й неприйняті угоди не нагадують", () => {
    for (const status of ["funded", "delivered"] as const) expect(payReminderDue(withStage(deal(), 0, { status }), T0 + 30 * DAY)).toBeNull();
    for (const method of ["safe", "escrow"] as const) expect(payReminderDue(deal(method), T0 + 30 * DAY)).toBeNull();
    for (const status of ["proposed", "completed", "declined", "cancelled"] as const) expect(payReminderDue(deal("direct", { status }), T0 + 30 * DAY)).toBeNull();
  });

  it("повтор не частіше разу на 7 днів і не більше двох разів на етап", () => {
    const first = withStage(deal(), 0, { payRemindedAt: new Date(T0 + 8 * DAY).toISOString(), payReminders: 1 });
    expect(payReminderDue(first, T0 + 8 * DAY + PAY_REMINDER_DAYS * DAY - 1)).toBeNull();
    expect(payReminderDue(first, T0 + 15 * DAY)).toEqual({ stageId: "deal_a1-s1", number: 2 });
    const second = withStage(deal(), 0, { payRemindedAt: new Date(T0 + 15 * DAY).toISOString(), payReminders: 2 });
    expect(payReminderDue(second, T0 + 90 * DAY)).toBeNull();
  });

  it("другий етап чекає від завершення першого, а не від прийняття угоди", () => {
    const next = withStage(deal(), 0, { status: "released", releasedAt: new Date(T0 + 20 * DAY).toISOString(), payReminders: 2 });
    expect(payReminderDue(next, T0 + 26 * DAY)).toBeNull();
    expect(payReminderDue(next, T0 + 27 * DAY)).toEqual({ stageId: "deal_a1-s2", number: 1 });
  });
});

describe("payReminderNotice", () => {
  const input = { dealId: "deal_a1", stageId: "deal_a1-s1", stageTitle: "Макет", number: 1 };
  it("замовнику й виконавцю різні тексти з назвою етапу, ключ залежить від номера нагадування", () => {
    const customer = payReminderNotice({ ...input, role: "customer" });
    const performerNotice = payReminderNotice({ ...input, role: "performer" });
    expect(customer.html).toBe("Угода: Ви оплатили етап «Макет»? Позначте «Я оплатив(ла)» в угоді.");
    expect(performerNotice.html).toBe("Угода: Оплата за етап «Макет» надійшла? Позначте «Оплату отримано».");
    expect(customer.kind).toBe("deals");
    expect(customer.email).toMatchObject({ type: "deal", stageTitle: "Макет" });
    expect(payReminderNotice({ ...input, role: "customer", number: 2 }).key).not.toBe(customer.key);
  });

  it("назва етапу екранується в Telegram", () => {
    expect(payReminderNotice({ ...input, role: "customer", stageTitle: "<b>x</b>" }).html).not.toContain("<b>");
  });

  it("лист каже те саме, що Telegram, з назвою етапу", () => {
    const notice = payReminderNotice({ ...input, role: "performer" });
    const mail = renderNoticeMail({ event: notice.email!, held: 0, siteUrl: "https://findlyfy.test", unsubscribeUrl: "https://findlyfy.test/u" });
    expect(mail.text).toContain("Оплата за етап «Макет» надійшла? Позначте «Оплату отримано».");
  });
});
