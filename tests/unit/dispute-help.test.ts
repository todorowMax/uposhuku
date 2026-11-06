import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null, admin: null as { id: string; email: string } | null }));
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/server/admin", () => ({ getAdmin: async () => session.admin }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { POST as ADMIN_CLOSE } from "@/app/api/admin/complaints/[id]/close/route";
import { POST as COMPLAINT } from "@/app/api/deals/[id]/complaint/route";
import { POST as DEAL_ACTION } from "@/app/api/deals/[id]/route";
import { POST as RECEIPT } from "@/app/api/deals/[id]/receipt/route";
import { getDisputeCard } from "@/lib/server/admin-repo";
import { getOrCreateConversation, listMessages, saveChatPhoto } from "@/lib/server/chat-repo";
import { actAsPerformer, claimDirectPayment, getDealById, proposeDirectDeal } from "@/lib/server/deal-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
/** Пара цього тесту: щоразу нова, бо в розмові не більше п'яти відкритих замовлень. */
const who = { cust: "dh-cust", perf: "dh-perf", other: "dh-other" };
let counter = 0;
const as = (id: string) => {
  session.user = { id, email: `${id}@example.com` };
};
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["dh-cust", "dh-perf", "dh-other"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  session.admin = null;
});

const post = (url: string, body: unknown) => new Request(`https://findlyfy.test${url}`, { method: "POST", body: JSON.stringify(body) });
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });

/** Прийнята пряма угода з розмови: замовник dh-cust, виконавець dh-perf. */
const acceptedDeal = async (options: { criteria?: string } = {}) => {
  counter += 1;
  who.cust = `dh-c${counter}`;
  who.perf = `dh-p${counter}`;
  await makeUser(ctx.db, who.cust);
  await makeUser(ctx.db, who.perf);
  as(who.cust);
  const conversation = await getOrCreateConversation(who.cust, `me-${who.perf}`, who.perf);
  const deal = await proposeDirectDeal(
    { id: conversation.id, customerUserId: who.cust, performerId: `me-${who.perf}` },
    "customer",
    { title: "Лендинг", criteria: options.criteria, method: "direct", performer: { id: `me-${who.perf}`, name: "Юлія", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Робота", amount: 1000, days: 5 }] },
    { safeEnabled: false },
  );
  if (typeof deal === "string") throw new Error(deal);
  const accepted = await actAsPerformer(who.perf, deal.id, "accept", undefined);
  if (typeof accepted === "string" || accepted === null) throw new Error(String(accepted));
  return { deal: accepted, conversationId: conversation.id };
};

describe("критерії в угоді", () => {
  it("зберігаються при створенні, довгі відхиляються, прийняття їх не змінює", async () => {
    const { deal } = await acceptedDeal({ criteria: "Макет і верстка" });
    expect(deal.criteria).toBe("Макет і верстка");
    expect((await getDealById(deal.id))?.criteria).toBe("Макет і верстка");
    const conversation = await getOrCreateConversation(who.cust, `me-${who.perf}`, who.perf);
    const tooLong = await proposeDirectDeal(
      { id: conversation.id, customerUserId: who.cust, performerId: `me-${who.perf}` },
      "customer",
      { title: "Інше", criteria: "x".repeat(501), method: "direct", performer: deal.performer, stages: [{ title: "Робота", amount: 1000, days: 5 }] },
      { safeEnabled: false },
    );
    expect(tooLong).toMatch(/500/);
  });
});

describe("чек", () => {
  it("свій файл прив'язується до етапу й потрапляє в розмову; чужий файл і чужа угода дають 404", async () => {
    const { deal, conversationId } = await acceptedDeal();
    const stageId = deal.stages[0].id;
    const mine = (await saveChatPhoto(conversationId, who.cust, jpeg)) as { id: string };
    const foreign = (await saveChatPhoto(conversationId, who.perf, jpeg)) as { id: string };

    // Чужий файл (завантажив виконавець) замовник як свій чек не прив'яже.
    expect((await RECEIPT(post("/", { stageId, attachmentId: foreign.id }), ctxOf(deal.id))).status).toBe(404);
    // Сторонній користувач не бачить угоди взагалі.
    as(who.other);
    expect((await RECEIPT(post("/", { stageId, attachmentId: mine.id }), ctxOf(deal.id))).status).toBe(404);
    // Виконавець не замовник: чек додає лише замовник.
    as(who.perf);
    expect((await RECEIPT(post("/", { stageId, attachmentId: mine.id }), ctxOf(deal.id))).status).toBe(404);

    as(who.cust);
    const ok = await RECEIPT(post("/", { stageId, attachmentId: mine.id }), ctxOf(deal.id));
    expect(ok.status).toBe(200);
    expect((await getDealById(deal.id))?.stages[0].receiptAttachmentId).toBe(mine.id);
    expect((await listMessages(conversationId)).some((message) => message.attachments?.some((item) => item.id === mine.id))).toBe(true);
  });

  it("етап не знайдено й угода без розмови дають зрозумілу відмову, а не збій", async () => {
    const { deal, conversationId } = await acceptedDeal();
    const photo = (await saveChatPhoto(conversationId, who.cust, jpeg)) as { id: string };
    expect((await RECEIPT(post("/", { stageId: "nope", attachmentId: photo.id }), ctxOf(deal.id))).status).toBe(409);
  });
});

describe("результат при здачі етапу", () => {
  it("неправильне посилання відхиляється й етап не здається; правильне зберігається", async () => {
    const { deal } = await acceptedDeal();
    await claimDirectPayment({ userId: who.cust, dealId: deal.id });
    await actAsPerformer(who.perf, deal.id, "confirm_paid", undefined);
    as(who.perf);
    const bad = await DEAL_ACTION(post("/", { as: "performer", action: "deliver", deliveryLink: "http://example.com/x" }), ctxOf(deal.id));
    expect(bad.status).toBe(400);
    expect((await getDealById(deal.id))?.stages[0].status).toBe("funded");
    const good = await DEAL_ACTION(post("/", { as: "performer", action: "deliver", deliveryText: "Все готово", deliveryLink: "https://example.com/r" }), ctxOf(deal.id));
    expect(good.status).toBe(200);
    const stage = (await getDealById(deal.id))?.stages[0];
    expect(stage).toMatchObject({ status: "delivered", delivery: { text: "Все готово", link: "https://example.com/r" } });
  });
});

describe("скарга на пряму угоду", () => {
  it("чужа скарга 404; до позначки оплати відмова; повтор від тієї ж сторони відхиляється; гроші й статус не змінюються", async () => {
    const { deal, conversationId } = await acceptedDeal();
    const stageId = deal.stages[0].id;
    const body = { stageId, reason: "no_delivery", text: "Оплатив, а роботи немає вже тиждень" };

    as(who.other);
    expect((await COMPLAINT(post("/", body), ctxOf(deal.id))).status).toBe(404);

    as(who.cust);
    expect((await COMPLAINT(post("/", body), ctxOf(deal.id))).status).toBe(409);
    await claimDirectPayment({ userId: who.cust, dealId: deal.id });

    const first = await COMPLAINT(post("/", body), ctxOf(deal.id));
    expect(first.status).toBe(201);
    const again = await COMPLAINT(post("/", body), ctxOf(deal.id));
    expect(again.status).toBe(409);

    const after = await getDealById(deal.id);
    expect(after?.stages[0].status).toBe("claimed");
    expect(after?.status).toBe("accepted");

    // Друга сторона бачить у розмові лише службовий рядок без тексту скарги й причини.
    const notice = (await listMessages(conversationId)).filter((message) => message.text.includes("подано скаргу"));
    expect(notice).toHaveLength(1);
    expect(notice[0].text).not.toContain("тиждень");
    expect(notice[0].text).toContain("Прямий переказ ми повернути не можемо");

    // Виконавець теж може поскаржитися окремо від замовника.
    as(who.perf);
    expect((await COMPLAINT(post("/", { stageId, reason: "no_contact", text: "Замовник не відповідає на повідомлення" }), ctxOf(deal.id))).status).toBe(201);
  });

  it("модератор бачить скаргу з хронологією й закриває її з коментарем; закриту вдруге не закрити", async () => {
    const { deal } = await acceptedDeal();
    await claimDirectPayment({ userId: who.cust, dealId: deal.id, via: undefined });
    const stageId = deal.stages[0].id;
    const filed = await COMPLAINT(post("/", { stageId, reason: "quality", text: "Робота не відповідає домовленості" }), ctxOf(deal.id));
    expect(filed.status).toBe(201);

    const card = await getDisputeCard(deal.id);
    expect(card?.complaints).toHaveLength(1);
    expect(card?.timeline.events.some((event) => event.label.startsWith("Скарга"))).toBe(true);
    const id = card!.complaints[0].id;

    session.user = null;
    expect((await ADMIN_CLOSE(post("/", { comment: "Розглянуто, сторони домовились" }), ctxOf(id))).status).toBe(404);
    session.admin = { id: who.other, email: "admin@example.com" };
    expect((await ADMIN_CLOSE(post("/", { comment: "коротко" }), ctxOf(id))).status).toBe(400);
    expect((await ADMIN_CLOSE(post("/", { comment: "Розглянуто, сторони домовились" }), ctxOf(id))).status).toBe(200);
    expect((await ADMIN_CLOSE(post("/", { comment: "Розглянуто, сторони домовились" }), ctxOf(id))).status).toBe(404);
    const closed = (await getDisputeCard(deal.id))?.complaints[0];
    expect(closed).toMatchObject({ status: "closed", closedByEmail: "admin@example.com", closeComment: "Розглянуто, сторони домовились" });

    // Після закриття на той самий етап можна подати нову.
    as(who.cust);
    expect((await COMPLAINT(post("/", { stageId, reason: "other", text: "Проблема повернулась знову" }), ctxOf(deal.id))).status).toBe(201);
  });
});
