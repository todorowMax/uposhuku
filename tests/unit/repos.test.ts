import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDeal } from "@/lib/deals/machine";
import type { DealDraft } from "@/lib/deals/types";
import { emptyProfile } from "@/lib/profile/types";
import { accessibleConversation, addMessage, getOrCreateConversation, listConversations, listMessages, performerKnown } from "@/lib/server/chat-repo";
import { actAsPerformer, actOnDeal, listDeals, listDealsForPerformer, proposeDeal } from "@/lib/server/deal-repo";
import { deleteProfile, getProfile, listPublishedProfiles, saveProfile } from "@/lib/server/profile-repo";
import { closeRequest, createRequest, findRequest, listOthersOpen, listRequests } from "@/lib/server/request-repo";
import { addReview, getReviewStats, reviewOfDeal, reviewsFor } from "@/lib/server/review-repo";
import { allPerformerStats, performerStatsOf } from "@/lib/server/stats-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["p1", "p2", "c1", "c2", "perf"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});

const profile = (name: string, published = true) => ({
  ...emptyProfile(name),
  cityId: "lviv",
  location: { lat: 49.84, lng: 24.03 },
  specialty: "Розробник",
  bio: "Роблю сайти",
  tags: ["website", "landing"],
  photo: "data:image/jpeg;base64,AAAA",
  published,
  works: [
    { id: "w1", title: "Сайт кав'ярні", description: "Лендинг для кав'ярні", url: "https://example.com", tags: ["landing"] },
    { id: "w2", title: "Бот", description: "Telegram-бот", url: "", tags: ["telegram-bot", "automation"] },
  ],
});

describe("профіль на D1", () => {
  it("зберігається разом з тегами й роботами і читається назад", async () => {
    expect(await getProfile("p1")).toBeNull();
    const saved = await saveProfile("p1", profile("Олена"));
    expect(saved).toMatchObject({ name: "Олена", cityId: "lviv", location: { lat: 49.84, lng: 24.03 }, published: true });
    expect(saved.tags.sort()).toEqual(["landing", "website"]);
    expect(saved.works.map((work) => work.id)).toEqual(["w1", "w2"]);
    expect(saved.works[1].tags.sort()).toEqual(["automation", "telegram-bot"]);
    expect(saved.photo).toBe("data:image/jpeg;base64,AAAA");
  });

  it("повторне збереження замінює теги й роботи, а не множить їх; id робіт стабільні", async () => {
    await saveProfile("p1", profile("Олена"));
    const again = await saveProfile("p1", { ...profile("Олена Коваль"), tags: ["website"], works: [{ id: "w1", title: "Інше", description: "", url: "", tags: [] }] });
    expect(again).toMatchObject({ name: "Олена Коваль", tags: ["website"] });
    expect(again.works).toHaveLength(1);
    expect(again.works[0].id).toBe("w1");
  });

  it("робота з однаковим id у різних людей не конфліктує", async () => {
    await saveProfile("p2", profile("Іван"));
    expect((await getProfile("p2"))?.works.map((work) => work.id)).toEqual(["w1", "w2"]);
    expect((await getProfile("p1"))?.works).toHaveLength(1);
  });

  it("опубліковані окремо від чернеток, видалення прибирає все", async () => {
    await saveProfile("p2", profile("Іван", false));
    expect([...(await listPublishedProfiles()).keys()]).toEqual(["p1"]);
    await deleteProfile("p1");
    expect(await getProfile("p1")).toBeNull();
    expect([...(await listPublishedProfiles()).keys()]).toEqual([]);
  });
});

describe("запити на D1", () => {
  it("створюється з тегами, файлами й умовами; свій видно, чужий — як неіснуючий", async () => {
    const created = await createRequest("c1", {
      text: "Потрібен сайт",
      tags: [{ id: "website", label: "Сайт" }, { id: "website", label: "Сайт" }],
      files: [{ name: "brief.pdf", size: 1200, type: "application/pdf" }],
      budget: 15000,
      deadline: "week",
      cityId: "kyiv",
    });
    expect(created).toMatchObject({ status: "open", budget: 15000, deadline: "week", cityId: "kyiv" });
    expect(created.tags).toEqual([{ id: "website", label: "Сайт" }]);
    expect(created.files).toEqual([{ name: "brief.pdf", size: 1200, type: "application/pdf" }]);
    expect(await findRequest("c1", created.id)).toMatchObject({ id: created.id });
    expect(await findRequest("c2", created.id)).toBeNull();
  });

  it("закривається лише власником і зникає зі стрічки інших", async () => {
    const request = await createRequest("c1", { text: "Ще один запит", tags: [], files: [] });
    expect((await listOthersOpen("c2")).some((item) => item.id === request.id)).toBe(true);
    expect(await closeRequest("c2", request.id)).toBeNull();
    expect((await closeRequest("c1", request.id))?.status).toBe("closed");
    expect((await listOthersOpen("c2")).some((item) => item.id === request.id)).toBe(false);
    expect((await listRequests("c1"))[0].createdAt >= (await listRequests("c1"))[1].createdAt).toBe(true);
  });
});

const draft = (overrides: Partial<DealDraft> = {}): DealDraft => ({
  requestId: "req_x",
  responseId: "resp_x",
  method: "direct",
  performer: { id: "kyiv-0", name: "Олена", avatarIndex: 0, specialty: "Дизайнерка", fop: false },
  stages: [{ title: "Робота", amount: 5000, days: 7 }],
  ...overrides,
});

describe("угоди на D1", () => {
  it("пропонується, зберігається й не дублюється на один відгук", async () => {
    const deal = await proposeDeal("c1", draft(), 1_000_000);
    expect(typeof deal).toBe("object");
    expect((await listDeals("c1")).map((item) => item.id)).toContain((deal as { id: string }).id);
    expect(await proposeDeal("c1", draft(), 1_000_000)).toMatch(/уже є угода/);
    expect(await listDeals("c2")).toEqual([]);
  });

  it("дії замовника змінюють угоду, чужа не доступна", async () => {
    const created = (await proposeDeal("c2", draft({ responseId: "resp_y" }), 5_000_000)) as { id: string };
    // Поки виконавець не прийняв, платити рано.
    expect(await actOnDeal("c2", created.id, "claim_paid", undefined, 5_000_100)).toMatch(/погодитися/);
    expect(await actOnDeal("c1", created.id, "cancel", undefined)).toBeNull();
    const cancelled = await actOnDeal("c2", created.id, "cancel", undefined, 5_000_200);
    expect(cancelled).toMatchObject({ status: "cancelled" });
    expect((await listDeals("c2")).find((item) => item.id === created.id)?.status).toBe("cancelled");
    expect(createDeal("t", draft(), 0).status).toBe("proposed");
  });
});

describe("угоди з боку виконавця на D1", () => {
  it("виконавець бачить свої угоди, відповідає, і замовник бачить результат", async () => {
    const created = (await proposeDeal("c1", draft({ responseId: "resp_real", performer: { id: "me-perf", name: "Максим", avatarIndex: 0, specialty: "Розробник", fop: false } }), 9_000_000)) as { id: string };
    // Само по собі нічого не відбувається: угода чекає відповіді виконавця.
    expect((await listDeals("c1")).find((deal) => deal.id === created.id)?.status).toBe("proposed");
    expect((await listDealsForPerformer("perf")).map((deal) => deal.id)).toContain(created.id);
    expect(await listDealsForPerformer("p2")).toEqual([]);

    const conv = await getOrCreateConversation("c1", "me-perf", "perf");
    expect((await listDealsForPerformer("perf", conv.id)).map((deal) => deal.id)).toContain(created.id);
    expect(await listDealsForPerformer("perf", "nonexistent")).toEqual([]);

    expect(await actAsPerformer("p2", created.id, "accept", undefined)).toBeNull();
    const accepted = await actAsPerformer("perf", created.id, "accept", undefined);
    expect(accepted).toMatchObject({ status: "accepted" });
    expect((await listDeals("c1")).find((deal) => deal.id === created.id)?.status).toBe("accepted");
    expect(await actAsPerformer("perf", created.id, "deliver", undefined)).toMatch(/оплату підтверджено/);
  });
});

describe("відгуки про роботу на D1", () => {
  it("один на угоду, рахується середня", async () => {
    const review = await addReview("c1", { performerId: "me-perf", dealId: "deal_1", stars: 5, text: "Чудово", author: "Анна" });
    expect(await reviewOfDeal("deal_1")).toMatchObject({ id: review.id, stars: 5 });
    await expect(addReview("c1", { performerId: "me-perf", dealId: "deal_1", stars: 4, text: "", author: "Анна" })).rejects.toThrow();
    const list = await reviewsFor("me-perf");
    expect(list).toHaveLength(1);
    expect(await getReviewStats("me-perf")).toEqual({ count: 1, average: 5 });
    expect(await getReviewStats("me-nobody")).toEqual({ count: 0, average: null });
  });
});

describe("чат на D1", () => {
  it("розмова одна на пару; доступ лише у двох учасників; повідомлення за since", async () => {
    await saveProfile("perf", profile("Максим"));
    expect(await performerKnown("me-perf", "c1")).toEqual({ userId: "perf" });
    expect(await performerKnown("me-perf", "perf")).toBeNull();
    expect(await performerKnown("me-nobody", "c1")).toBeNull();
    expect(await performerKnown("kyiv-0", "c1")).toBeNull();
    expect(await performerKnown("nonsense", "c1")).toBeNull();

    const conv = await getOrCreateConversation("c1", "me-perf", "perf");
    expect((await getOrCreateConversation("c1", "me-perf", "perf")).id).toBe(conv.id);
    expect(await accessibleConversation(conv.id, "c1")).toMatchObject({ role: "customer" });
    expect(await accessibleConversation(conv.id, "perf")).toMatchObject({ role: "performer" });
    expect(await accessibleConversation(conv.id, "c2")).toBeNull();

    const first = await addMessage(conv.id, "customer", "Потрібен лендинг");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await addMessage(conv.id, "performer", "Добрий день, можу взяти");
    expect((await listMessages(conv.id)).map((message) => message.from)).toEqual(["customer", "performer"]);
    expect((await listMessages(conv.id, Date.parse(first.at))).map((message) => message.from)).toEqual(["performer"]);

    const forCustomer = await listConversations("c1");
    expect(forCustomer[0]).toMatchObject({ role: "customer", other: { name: "Максим" }, lastMessage: { text: "Добрий день, можу взяти" } });
    expect((await listConversations("perf"))[0]).toMatchObject({ role: "performer", other: { name: "c1" } });
    expect(await listConversations("c2")).toEqual([]);
  });
});

describe("великі обсяги: у D1 не більше 100 параметрів у запиті", () => {
  it("профілі, проєкти й запити читаються пачками", async () => {
    const ids = Array.from({ length: 160 }, (_, index) => `bulk-${index}`);
    for (const id of ids) await makeUser(ctx.db, id);
    for (const id of ids) await saveProfile(id, profile(`Людина ${id}`));
    const published = await listPublishedProfiles();
    const bulk = [...published.keys()].filter((id) => id.startsWith("bulk-"));
    expect(bulk).toHaveLength(160);
    expect(published.get("bulk-100")?.works.map((work) => work.id)).toEqual(["w1", "w2"]);
    expect(published.get("bulk-159")?.tags.sort()).toEqual(["landing", "website"]);

    for (const id of ids.slice(0, 120)) await createRequest(id, { text: `Запит від ${id}`, tags: [{ id: "website", label: "Сайт" }], files: [] });
    const others = await listOthersOpen("c2");
    expect(others.filter((request) => request.text.startsWith("Запит від bulk-"))).toHaveLength(120);
    expect(others.every((request) => request.tags.length >= 0)).toBe(true);
  }, 60_000);
});

describe("цифри виконавця з бази", () => {
  it("місяці з реєстрації, завершені угоди й середня оцінка рахуються, а не вигадуються", async () => {
    await makeUser(ctx.db, "stat-perf");
    await makeUser(ctx.db, "stat-cust");
    await ctx.db.prepare("update users set created_at = ? where id = ?").bind(Date.now() - 95 * 24 * 60 * 60 * 1000, "stat-perf").run();
    expect(await performerStatsOf("stat-perf")).toEqual({ months: 3, orders: 0, rating: null, reviews: 0 });

    const performer = { id: "me-stat-perf", name: "Стат", avatarIndex: 0, specialty: "Розробник", fop: false };
    const created = (await proposeDeal("stat-cust", draft({ responseId: "resp_stat", performer }), 20_000_000)) as { id: string };
    await actAsPerformer("stat-perf", created.id, "accept", undefined, 20_000_001);
    await actOnDeal("stat-cust", created.id, "claim_paid", undefined, 20_000_002);
    await actAsPerformer("stat-perf", created.id, "confirm_paid", undefined, 20_000_003);
    await actAsPerformer("stat-perf", created.id, "deliver", undefined, 20_000_004);
    const done = await actOnDeal("stat-cust", created.id, "release", undefined, 20_000_005);
    expect(done).toMatchObject({ status: "completed" });
    await addReview("stat-cust", { performerId: "me-stat-perf", dealId: created.id, stars: 4, text: "", author: "Олена" });
    await addReview("stat-cust", { performerId: "me-stat-perf", dealId: "deal_other", stars: 5, text: "", author: "Іван" });

    expect(await performerStatsOf("stat-perf")).toEqual({ months: 3, orders: 1, rating: 4.5, reviews: 2 });
    expect((await allPerformerStats()).get("me-stat-perf")).toMatchObject({ orders: 1 });
    expect(await performerStatsOf("nobody-here")).toEqual({ months: 0, orders: 0, rating: null, reviews: 0 });
  });
});
