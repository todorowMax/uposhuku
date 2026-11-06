// Ітерація 9: чат і відгуки без N+1. Відповіді API лишаються тими самими (перші тести,
// зелені до і після правки), а число запитів до D1 не росте з кількістю розмов і відгуків.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { conversations, messages, responses, reviews } from "@/db/schema";
import { responsesFor } from "@/lib/requests/responses";
import { emptyProfile } from "@/lib/profile/types";
import { addPayment, getPlacement, tiersFor } from "@/lib/server/placement-repo";
import { listConversations } from "@/lib/server/chat-repo";
import { proposeDirectDeal } from "@/lib/server/deal-repo";
import { getDb } from "@/lib/server/db";
import { saveProfile } from "@/lib/server/profile-repo";
import { createRequest, responsesTo } from "@/lib/server/request-repo";
import { getReviewStats } from "@/lib/server/review-repo";
import { countD1Queries, makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

const BASE = Date.parse("2026-01-01T00:00:00Z");
const LONG_TEXT = "Потрібен великий проєкт з довгою назвою, яка не вміщається";
const profileOf = (name: string, published = true) => ({ ...emptyProfile(name), cityId: "kyiv", specialty: `Спец ${name}`, tags: ["landing"], photo: `/p/${name}.jpg`, published });

/** Вставка частинами: у D1 не більше 100 змінних на запит. */
const insertAll = async <T extends object>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 8) => {
  for (let start = 0; start < rows.length; start += size) await insert(rows.slice(start, start + size));
};

/**
 * Замовник `<p>c` і n виконавців. Розмова i: два повідомлення (i·10 і i·10+5 після BASE), оновлена в BASE + i·1000,
 * тож свіжі розмови мають більший i. Профіль є не в кожного (i % 4 === 3 без профілю). Відгук на запит мають парні.
 */
const buildChat = async (p: string, n: number) => {
  const db = getDb();
  const customer = await makeUser(ctx.db, `${p}c`);
  const other = await makeUser(ctx.db, `${p}c2`);
  const convRows: (typeof conversations.$inferInsert)[] = [];
  const messageRows: (typeof messages.$inferInsert)[] = [];
  const offerRows: (typeof responses.$inferInsert)[] = [];
  const old = await createRequest(customer, { text: "Старий запит", tags: [], files: [] });
  const fresh = await createRequest(customer, { text: LONG_TEXT, tags: [], files: [] });
  for (let i = 0; i < n; i++) {
    const perf = await makeUser(ctx.db, `${p}perf${i}`);
    if (i % 4 !== 3) await saveProfile(perf, profileOf(`${p}Імя${i}`));
    convRows.push({ id: `${p}conv${i}`, customerUserId: customer, performerId: `me-${perf}`, performerUserId: perf, createdAt: BASE, updatedAt: BASE + i * 1000 });
    messageRows.push({ id: `${p}m${i}a`, conversationId: `${p}conv${i}`, from: "customer", text: `Перше ${i}`, kind: "text", createdAt: BASE + i * 10 });
    messageRows.push({ id: `${p}m${i}b`, conversationId: `${p}conv${i}`, from: "performer", text: `Останнє ${i}`, kind: i % 6 === 0 ? "system" : "text", contextId: i % 6 === 0 ? "ctx1" : null, createdAt: BASE + i * 10 + 5 });
    if (i % 2 === 0) {
      offerRows.push({ id: `${p}ro${i}`, requestId: old.id, performerUserId: perf, price: 1, days: 1, message: "старий", createdAt: BASE + 1 });
      offerRows.push({ id: `${p}rn${i}`, requestId: fresh.id, performerUserId: perf, price: 1, days: 1, message: "новий", createdAt: BASE + 2 });
    }
  }
  // Замовник сам виконавець в одній розмові з чужим замовником.
  convRows.push({ id: `${p}convX`, customerUserId: other, performerId: `me-${customer}`, performerUserId: customer, createdAt: BASE, updatedAt: BASE - 1000 });
  messageRows.push({ id: `${p}mX`, conversationId: `${p}convX`, from: "customer", text: "Привіт, виконавцю", kind: "text", createdAt: BASE - 500 });
  await insertAll(convRows, (chunk) => db.insert(conversations).values(chunk), 12);
  await insertAll(messageRows, (chunk) => db.insert(messages).values(chunk), 9);
  await insertAll(offerRows, (chunk) => db.insert(responses).values(chunk), 12);
  // Умови в кожній п'ятій розмові.
  const draft = (id: string) => ({ method: "direct" as const, title: "Лендинг", description: "Опис", performer: { id, name: "В", avatarIndex: 0, specialty: "Р", fop: false }, stages: [{ title: "Робота", amount: 8000, days: 10 }] });
  for (let i = 0; i < n; i += 5) {
    const result = await proposeDirectDeal({ id: `${p}conv${i}`, customerUserId: customer, performerId: `me-${p}perf${i}` }, "performer", draft(`me-${p}perf${i}`), { safeEnabled: true });
    if (typeof result === "string") throw new Error(result);
  }
  // proposeDirectDeal може оновлювати розмову: повертаємо задані мітки часу.
  for (let i = 0; i < n; i++) await db.update(conversations).set({ updatedAt: BASE + i * 1000 }).where(eq(conversations.id, `${p}conv${i}`));
  return { customer, other };
};

describe("listConversations: відповідь не змінилась", () => {
  it("порядок, останнє повідомлення, співрозмовник, умови й відгук", async () => {
    const { customer } = await buildChat("e-", 11);
    const list = await listConversations(customer);
    // Свіжі першими: 10..0, а розмова, де замовник сам виконавець, найстарша.
    expect(list.map((item) => item.id)).toEqual([...Array.from({ length: 11 }, (_, k) => `e-conv${10 - k}`), "e-convX"]);
    list.slice(0, 11).forEach((item, k) => {
      const i = 10 - k;
      expect(item).toMatchObject({ performerId: `me-e-perf${i}`, role: "customer", updatedAt: new Date(BASE + i * 1000).toISOString() });
      expect(item.lastMessage).toMatchObject({ text: `Останнє ${i}`, from: "performer", at: new Date(BASE + i * 10 + 5).toISOString() });
      expect(item.lastMessage?.kind).toBe(i % 6 === 0 ? "system" : undefined);
      expect(item.lastMessage?.contextId).toBe(i % 6 === 0 ? "ctx1" : undefined);
      expect(item.lastMessage && "attachments" in item.lastMessage).toBe(false);
      expect(item.other).toEqual(i % 4 === 3 ? { name: "Виконавець", photo: undefined, specialty: undefined } : { name: `e-Імя${i}`, photo: `/p/e-Імя${i}.jpg`, specialty: `Спец e-Імя${i}` });
      expect(item.phase).toBe(i % 5 === 0 ? "deal" : "chat");
      if (i % 5 === 0) expect(item.deal).toEqual({ label: "Пропонує угоду", needsMe: true });
      else expect(item.deal).toBeUndefined();
      // Відгук береться з найновішого відгуку пари, довгий текст урізаний.
      if (i % 2 === 0) expect(item.offer).toEqual({ title: `${LONG_TEXT.slice(0, 39).trimEnd()}…` });
      else expect(item.offer).toBeUndefined();
    });
    expect(list[11]).toMatchObject({ role: "performer", other: { name: "Замовник" }, lastMessage: { text: "Привіт, виконавцю" }, phase: "chat" });
  });

  it("порожній список і чужий користувач", async () => {
    await makeUser(ctx.db, "e-nobody");
    expect(await listConversations("e-nobody")).toEqual([]);
  });

  it("у розмові з рівним часом двох повідомлень останнім стає те, чий id більший", async () => {
    const db = getDb();
    await makeUser(ctx.db, "t-c");
    await makeUser(ctx.db, "t-p");
    await db.insert(conversations).values({ id: "t-conv", customerUserId: "t-c", performerId: "me-t-p", performerUserId: "t-p", createdAt: BASE, updatedAt: BASE });
    await db.insert(messages).values([
      { id: "t-m1", conversationId: "t-conv", from: "customer", text: "перше", kind: "text", createdAt: BASE },
      { id: "t-m2", conversationId: "t-conv", from: "performer", text: "друге", kind: "text", createdAt: BASE },
    ]);
    expect((await listConversations("t-c"))[0].lastMessage?.text).toBe("друге");
  });
});

describe("listConversations: число запитів не росте з розмовами", () => {
  it("5 і 50 розмов дають однакову кількість запитів", async () => {
    const small = await buildChat("s5-", 5);
    const big = await buildChat("s50-", 50);
    const a = await countD1Queries(() => listConversations(small.customer));
    const b = await countD1Queries(() => listConversations(big.customer));
    expect(a.result).toHaveLength(6);
    expect(b.result).toHaveLength(51);
    if (process.env.COUNT_LOG) console.log("conversations queries", a.queries, b.queries);
    expect(b.queries).toBe(a.queries);
  });
});

/**
 * Запит `<p>req` із n виконавцями. Кожен третій (i % 3 === 2) не опублікований. Платять парні (100 + i·10),
 * у виконавців з i % 4 === 0 три відгуки (5, 4, 4), у решти непарних з i % 3 === 0 два (5, 4), в інших немає.
 */
const buildOffers = async (p: string, n: number) => {
  const customer = await makeUser(ctx.db, `${p}c`);
  const request = await createRequest(customer, { text: "Потрібен лендинг", tags: [], files: [] });
  const responseRows: (typeof responses.$inferInsert)[] = [];
  const reviewRows: (typeof reviews.$inferInsert)[] = [];
  for (let i = 0; i < n; i++) {
    const perf = await makeUser(ctx.db, `${p}perf${i}`);
    await saveProfile(perf, profileOf(`${p}Імя${i}`, i % 3 !== 2));
    // Час відповіді спадає з i, щоб серед рівних рівнів першими були пізніші i.
    responseRows.push({ id: `${p}r${i}`, requestId: request.id, performerUserId: perf, price: 1000 + i, days: (i % 7) + 1, message: `Текст ${i}`, createdAt: BASE + (n - i) * 1000 });
    if (i % 2 === 0) await addPayment(perf, 100 + i * 10);
    const stars = i % 4 === 0 ? [5, 4, 4] : i % 2 === 1 && i % 3 === 0 ? [5, 4] : [];
    stars.forEach((value, k) => reviewRows.push({ id: `${p}rv${i}_${k}`, performerId: `me-${perf}`, dealId: `${p}d${i}_${k}`, authorUserId: customer, stars: value, text: "", author: "А", createdAt: BASE + k }));
  }
  await insertAll(responseRows, (chunk) => getDb().insert(responses).values(chunk), 12);
  await insertAll(reviewRows, (chunk) => getDb().insert(reviews).values(chunk), 10);
  return { customer, request };
};

describe("responsesFor: відповідь не змінилась", () => {
  it("поля, рівні як у getPlacement, рейтинг, порядок і непубліковані виключені", async () => {
    const { request } = await buildOffers("o-", 12);
    const offers = await responsesFor(request);
    const published = Array.from({ length: 12 }, (_, i) => i).filter((i) => i % 3 !== 2);
    expect(offers).toHaveLength(published.length);
    for (const offer of offers) {
      const i = Number(offer.performerId.replace("me-o-perf", ""));
      const stars = i % 4 === 0 ? "4.3" : i % 2 === 1 && i % 3 === 0 ? "4.5" : "—";
      expect(offer).toEqual({
        id: `resp_${request.id}_o-perf${i}`,
        requestId: request.id,
        performerId: `me-o-perf${i}`,
        name: `o-Імя${i}`,
        specialty: `Спец o-Імя${i}`,
        cityName: "Київ",
        avatarIndex: 0,
        photo: `/p/o-Імя${i}.jpg`,
        tier: (await getPlacement(`o-perf${i}`)).tier,
        promoted: (await getPlacement(`o-perf${i}`)).tier >= 2,
        rating: stars,
        price: 1000 + i,
        days: (i % 7) + 1,
        message: `Текст ${i}`,
        createdAt: new Date(BASE + (12 - i) * 1000).toISOString(),
      });
    }
    // Порядок: рівень за спаданням, серед рівних хто відповів раніше.
    const expected = [...offers].sort((a, b) => b.tier - a.tier || a.createdAt.localeCompare(b.createdAt));
    expect(offers.map((offer) => offer.id)).toEqual(expected.map((offer) => offer.id));
    expect(offers.some((offer) => offer.tier > 1)).toBe(true);
    expect(offers.some((offer) => offer.tier === 1)).toBe(true);
  });
});

describe("responsesFor: число запитів не росте з відгуками", () => {
  it("5 і 50 відгуків дають однакову кількість запитів", async () => {
    const small = await buildOffers("q5-", 5);
    const big = await buildOffers("q50-", 50);
    const a = await countD1Queries(() => responsesFor(small.request));
    const b = await countD1Queries(() => responsesFor(big.request));
    expect(a.result.length).toBeGreaterThan(0);
    expect(b.result.length).toBeGreaterThan(a.result.length);
    if (process.env.COUNT_LOG) console.log("responses queries", a.queries, b.queries);
    expect(b.queries).toBe(a.queries);
  });
});

describe("рівні й оцінки пачкою", () => {
  it("tiersFor збігається з getPlacement: платники, без оплат і з сумою нижче мінімуму", async () => {
    const ids = ["pt-rich", "pt-mid", "pt-tiny", "pt-none"];
    for (const id of ids) await makeUser(ctx.db, id);
    for (let i = 0; i < 8; i++) await addPayment(await makeUser(ctx.db, `pt-x${i}`), 150 + i * 400);
    await addPayment("pt-rich", 9000);
    await addPayment("pt-mid", 300);
    await addPayment("pt-tiny", 40);
    const tiers = await tiersFor([...ids, "pt-ghost"]);
    for (const id of [...ids, "pt-ghost"]) expect(tiers.get(id)).toBe((await getPlacement(id)).tier);
    expect(tiers.get("pt-none")).toBe(1);
    expect(tiers.get("pt-tiny")).toBe(1);
    expect(tiers.get("pt-rich")).toBeGreaterThan(1);
  });

  it("getReviewStats: порожньо, округлення як у averageStars", async () => {
    await makeUser(ctx.db, "rs-a");
    const rows = (stars: number[], performerId: string) => stars.map((value, k) => ({ id: `rs-${performerId}-${k}`, performerId, dealId: `rs-d-${performerId}-${k}`, authorUserId: "rs-a", stars: value, text: "", author: "А", createdAt: BASE + k }));
    await getDb().insert(reviews).values(rows([5, 4, 4], "rs-p1"));
    await getDb().insert(reviews).values(rows([5, 5, 4, 5, 5, 4, 5], "rs-p2"));
    expect(await getReviewStats("rs-none")).toEqual({ count: 0, average: null });
    expect(await getReviewStats("rs-p1")).toEqual({ count: 3, average: 4.3 });
    expect(await getReviewStats("rs-p2")).toEqual({ count: 7, average: 4.7 });
  });
});

describe("responsesTo: стеля 200", () => {
  it("віддає не більше 200 найраніших відгуків у визначеному порядку", async () => {
    const customer = await makeUser(ctx.db, "cap-c");
    const request = await createRequest(customer, { text: "Багато відгуків", tags: [], files: [] });
    const rows: (typeof responses.$inferInsert)[] = [];
    for (let i = 0; i < 205; i++) {
      const perf = await makeUser(ctx.db, `cap-p${i}`);
      // Час спадає з i, тож найраніші відгуки у великих i; порядок id не збігається з часом.
      rows.push({ id: `cap-r${i}`, requestId: request.id, performerUserId: perf, price: null, days: 1, message: "m", createdAt: BASE + (1000 - i) * 10 });
    }
    await insertAll(rows, (chunk) => getDb().insert(responses).values(chunk), 12);
    const list = await responsesTo(request.id);
    expect(list).toHaveLength(200);
    const times = list.map((item) => item.response.createdAt);
    expect(times).toEqual([...times].sort());
    expect(list[0].userId).toBe("cap-p204");
    expect(list.some((item) => item.userId === "cap-p0")).toBe(false);
  });
});
