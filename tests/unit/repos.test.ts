import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDeal, SIM } from "@/lib/deals/machine";
import type { DealDraft } from "@/lib/deals/types";
import { emptyProfile } from "@/lib/profile/types";
import { accessibleConversation, addMessage, getOrCreateConversation, listConversations, listMessages, performerKnown } from "@/lib/server/chat-repo";
import { actOnDeal, listDeals, proposeDeal } from "@/lib/server/deal-repo";
import { deleteProfile, getProfile, listPublishedProfiles, saveProfile } from "@/lib/server/profile-repo";
import { closeRequest, createRequest, findRequest, listOthersOpen, listRequests } from "@/lib/server/request-repo";
import { addReview, reviewOfDeal, reviewsFor } from "@/lib/server/review-repo";
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
    expect((await listDeals("c1", undefined, 1_000_000)).map((item) => item.id)).toContain((deal as { id: string }).id);
    expect(await proposeDeal("c1", draft(), 1_000_000)).toMatch(/уже є угода/);
    expect(await listDeals("c2")).toEqual([]);
  });

  it("стан доходить до «зараз» і зберігається, дії змінюють угоду", async () => {
    const created = (await proposeDeal("c2", draft({ responseId: "resp_y" }), 5_000_000)) as { id: string };
    const accepted = (await listDeals("c2", undefined, 5_000_000 + SIM.accept + 100)).find((item) => item.id === created.id)!;
    expect(accepted.status).toBe("accepted");
    // Той самий результат при повторному читанні: стан збережено, а не вигадано щоразу.
    expect((await listDeals("c2", undefined, 5_000_000 + SIM.accept + 100)).find((item) => item.id === created.id)!.status).toBe("accepted");
    const acted = await actOnDeal("c2", created.id, "claim_paid", accepted.stages[0].id, 5_000_000 + SIM.accept + 200);
    expect(typeof acted).toBe("object");
    expect(await actOnDeal("c1", created.id, "cancel", undefined)).toBeNull();
    expect(createDeal("t", draft(), 0).status).toBe("proposed");
  });
});

describe("відгуки про роботу на D1", () => {
  it("один на угоду; для справжніх виконавців демо-відгуків немає", async () => {
    const review = await addReview("c1", { performerId: "me-perf", dealId: "deal_1", stars: 5, text: "Чудово", author: "Анна" });
    expect(await reviewOfDeal("deal_1")).toMatchObject({ id: review.id, stars: 5 });
    await expect(addReview("c1", { performerId: "me-perf", dealId: "deal_1", stars: 4, text: "", author: "Анна" })).rejects.toThrow();
    const list = await reviewsFor("me-perf");
    expect(list).toHaveLength(1);
    expect((await reviewsFor("kyiv-0")).some((item) => item.demo)).toBe(true);
  });
});

describe("чат на D1", () => {
  it("розмова одна на пару; доступ лише у двох учасників; повідомлення за since", async () => {
    await saveProfile("perf", profile("Максим"));
    expect(await performerKnown("me-perf", "c1")).toEqual({ userId: "perf" });
    expect(await performerKnown("me-perf", "perf")).toBeNull();
    expect(await performerKnown("me-nobody", "c1")).toBeNull();
    expect(await performerKnown("kyiv-0", "c1")).toEqual({ userId: null });
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

  it("демо-виконавець: розмова без користувача-виконавця", async () => {
    const conv = await getOrCreateConversation("c2", "kyiv-0", null);
    expect(await accessibleConversation(conv.id, "c2")).toMatchObject({ role: "customer" });
  });
});
