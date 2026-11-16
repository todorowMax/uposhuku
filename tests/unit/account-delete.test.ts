// Видалення акаунта (lib/server/account-delete.ts): що з кожною таблицею, що блокує, що чужий не зачеплений.
// Рядок у users ніколи не видаляється фізично, тож угоди, платежі й відгуки лишаються цілими.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
const telegram = vi.hoisted(() => ({ deleted: [] as number[] }));
vi.mock("@/lib/telegram/config", () => ({ telegramConfig: () => ({ enabled: true, token: "t", webhookSecret: "s" }) }));
vi.mock("@/lib/telegram/api", () => ({ deleteMessage: async (_chat: string, id: number) => void telegram.deleted.push(id) }));

import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { DELETED_NAME, tombstoneEmail } from "@/lib/account/deletion";
import type { Deal } from "@/lib/deals/types";
import { deleteAccount, deleteBlockers } from "@/lib/server/account-delete";
import { purgeExpiredRequisites } from "@/lib/server/account-retention";
import { addMessage, getOrCreateConversation, listConversations } from "@/lib/server/chat-repo";
import { getDb } from "@/lib/server/db";
import { saveProfile } from "@/lib/server/profile-repo";
import { createRequest, saveResponse } from "@/lib/server/request-repo";
import { addReview } from "@/lib/server/review-repo";
import { getBucket } from "@/lib/server/uploads";
import { emptyProfile } from "@/lib/profile/types";
import { seedBankInvoice, seedComplaint, seedDeal } from "../helpers/account-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";
import { PDF_BYTES, attach, textBytes } from "../helpers/request-file-fixtures";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

const NOW = Date.parse("2026-11-13T12:00:00Z");
const db = () => getDb();
const count = async (table: keyof typeof schema, where = "") => Number((await ctx.db.prepare(`select count(*) as n from ${tableName(table)} ${where}`).first<{ n: number }>())?.n);
const names: Record<string, string> = {
  users: "users", sessions: "sessions", emailCodes: "email_codes", profiles: "profiles", profileTags: "profile_tags", projects: "projects", projectTags: "project_tags", requests: "requests", requestTags: "request_tags", requestFiles: "request_files",
  responses: "responses", payments: "payments", deals: "deals", reviews: "reviews", conversations: "conversations", messages: "messages", chatAttachments: "chat_attachments", presence: "presence", tagProposalUses: "tag_proposal_uses",
  telegramLinks: "telegram_links", telegramLinkTokens: "telegram_link_tokens", notificationPreferences: "notification_preferences", notificationLog: "notification_log", channelPosts: "channel_posts", dealPayments: "deal_payments",
  payoutAccounts: "payout_accounts", placementInvoices: "placement_invoices", payoutRequisites: "payout_requisites", dealRequisites: "deal_requisites", requisiteReads: "requisite_reads", dealReleaseCodes: "deal_release_codes",
  adminTotpState: "admin_totp_state", cryptoProofs: "crypto_proofs", walletChallenges: "wallet_challenges", dealComplaints: "deal_complaints", legalAcceptances: "legal_acceptances", authAttempts: "auth_attempts", moderationActions: "moderation_actions",
};
const tableName = (key: string) => names[key] ?? key;
const mine = (column: string, id: string) => `where ${column} = '${id}'`;

const photoUrl = (id: string) => `/api/uploads/photos/${id}/a.jpg`;
const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1]);
const keysOf = async (prefix: string) => (await getBucket().list({ prefix })).objects.map((object) => object.key);

/** Акаунт з рядком майже в кожній таблиці. Повертає ключові id. */
const seedRich = async (an: string) => {
  const email = `${an}@example.com`;
  const [cust, perf1, perf2, cust2] = await Promise.all(["cust", "perf1", "perf2", "cust2"].map((tag) => makeUser(ctx.db, `${an}-${tag}`)));
  await makeUser(ctx.db, an, { email, accepted: false });
  await ctx.db.prepare("update users set display_name = 'Анна', avatar_url = 'https://g.test/a.png', google_id = 'g-' || id, email_verified_at = 1, last_login_at = 2 where id = ?").bind(an).run();
  const d = db();
  await d.insert(schema.sessions).values({ id: `${an}-sess`, userId: an, via: "email", createdAt: 1, expiresAt: NOW + 1e9, lastSeenAt: 1 });
  await d.insert(schema.emailCodes).values({ id: `${an}-code`, userId: an, codeHash: "h", createdAt: 1, expiresAt: NOW + 1e6 });
  await d.insert(schema.presence).values({ userId: an, online: true, lastSeen: 1 });
  await d.insert(schema.telegramLinks).values({ userId: an, chatId: `chat-${an}`, linkedAt: 1 });
  await d.insert(schema.telegramLinkTokens).values({ tokenHash: `${an}-tok`, userId: an, expiresAt: NOW + 1e6 });
  await d.insert(schema.notificationPreferences).values({ userId: an, prefs: "{}", updatedAt: 1 });
  await d.insert(schema.notificationLog).values({ key: `${an}-n1`, userId: an, kind: "message", createdAt: 1 });
  await d.insert(schema.payoutAccounts).values({ id: `${an}-pa`, userId: an, provider: "monobank", taxId: "cipher", fopName: "ФОП", status: "active", createdAt: 1, updatedAt: 1 });
  await d.insert(schema.payoutRequisites).values({ userId: an, cipher: "cipher", mask: "UA21…6001", createdAt: 1, updatedAt: 1 });
  await d.insert(schema.walletChallenges).values({ nonce: `${an}-nonce`, userId: an, address: "0x1", domain: "findlyfy.test", createdAt: 1, expiresAt: 2 });
  await d.insert(schema.dealReleaseCodes).values({ id: `${an}-rc`, userId: an, dealId: "x", stageId: "y", codeHash: "h", createdAt: 1, expiresAt: 2 });
  await d.insert(schema.adminTotpState).values({ userId: an, lastCounter: 1, updatedAt: 1 });
  await d.insert(schema.authAttempts).values({ key: `email:${email}`, kind: "email_start", createdAt: NOW });
  await d.insert(schema.tagProposals).values({ id: `${an}-tp`, phraseKey: `${an}-key`, text: "нейромережі", createdAt: 1, updatedAt: 1 });
  await d.insert(schema.tagProposalUses).values({ proposalId: `${an}-tp`, userId: an, context: "profile", createdAt: 1 });
  // Згоди: дві версії умов, одна політики; усі з хешем IP.
  await d.insert(schema.legalAcceptances).values([
    { id: `${an}-l1`, userId: an, doc: "terms", version: "2026-01-01", acceptedAt: 10, source: "signup", ipHash: "iphash" },
    { id: `${an}-l2`, userId: an, doc: "terms", version: "2026-11-13", acceptedAt: 20, source: "reaccept", ipHash: "iphash" },
    { id: `${an}-l3`, userId: an, doc: "privacy", version: "2026-11-13", acceptedAt: 20, source: "signup", ipHash: "iphash" },
  ]);
  // Профіль з роботою, фото й файлами в R2.
  await saveProfile(an, { ...emptyProfile("Анна Профі"), cityId: "lviv", specialty: "Дизайн", bio: "Роблю логотипи.", tags: ["logo"], photo: photoUrl(an), published: true, works: [{ id: "w1", title: "Лого", description: "Для кафе", url: "https://x.test", tags: ["logo"], manualTags: [], hiddenTags: [] }] });
  await getBucket().put(`photos/${an}/a.jpg`, bytes);
  await getBucket().put(`photos/${an}/b.jpg`, bytes);
  // Запит із тегами, файлами, постом у каналі й відгуком чужого виконавця; її відгук на чужий запит.
  const request = await createRequest(an, { text: "Потрібен сайт", budget: null, deadline: null, cityId: null, tags: [{ id: "site", label: "Сайт" }], files: [{ id: (await attach(an, "brief.pdf", PDF_BYTES)).id }] });
  // Ще один файл, завантажений, але не доданий до запиту: теж лишає слід у R2.
  await attach(an, "draft.txt", textBytes("чернетка"));
  await d.insert(schema.channelPosts).values({ requestId: request.id, chatId: "-100", messageId: 777, status: "posted", postedAt: 1, updatedAt: 1 });
  await saveResponse(perf1, request.id, { price: 100, days: 2, message: "Зроблю" });
  const foreign = await createRequest(cust, { text: "Чужий запит", budget: null, deadline: null, cityId: null, tags: [], files: [] });
  await saveResponse(an, foreign.id, { price: 50, days: 1, message: "Я можу" });
  // Розмова без угоди (зникає) і з угодами (лишається).
  const bare = await getOrCreateConversation(an, `me-${perf1}`, perf1);
  await addMessage(bare.id, "customer", "Привіт, без угоди");
  await d.insert(schema.chatAttachments).values({ id: `${an}-att1`, conversationId: bare.id, uploaderUserId: an, key: `chat/${bare.id}/x.jpg`, mime: "image/jpeg", bytes: 4, createdAt: 1 });
  await getBucket().put(`chat/${bare.id}/x.jpg`, bytes);
  const kept = await getOrCreateConversation(an, `me-${perf2}`, perf2);
  await addMessage(kept.id, "customer", "Це розмова з угодою");
  await d.insert(schema.chatAttachments).values({ id: `${an}-att2`, conversationId: kept.id, uploaderUserId: an, key: `chat/${kept.id}/y.jpg`, mime: "image/jpeg", bytes: 4, createdAt: 1 });
  await getBucket().put(`chat/${kept.id}/y.jpg`, bytes);
  const asPerformer = await getOrCreateConversation(cust, `me-${an}`, an);
  await addMessage(asPerformer.id, "performer", "Я виконавець");
  await addMessage(asPerformer.id, "customer", "Дякую");
  // Угоди.
  await seedDeal({ id: `${an}-d1`, owner: an, performer: perf2, status: "completed", stages: ["released"], updatedAt: 100 });
  await seedDeal({ id: `${an}-d2`, owner: cust, performer: an, status: "completed", stages: ["released"], updatedAt: 100 });
  await seedDeal({ id: `${an}-d3`, owner: cust2, performer: an, status: "completed", stages: ["released"], updatedAt: 100 });
  await seedDeal({ id: `${an}-d4`, owner: an, performer: cust2, status: "proposed" });
  await seedDeal({ id: `${an}-d5`, owner: cust, performer: an, status: "accepted", stages: ["pending"] });
  await seedComplaint(`${an}-d3`, cust2, "closed");
  for (const id of [`${an}-d2`, `${an}-d3`]) {
    await d.insert(schema.dealRequisites).values({ dealId: id, cipher: "cipher", mask: "UA21…", createdAt: 1 });
    await d.insert(schema.requisiteReads).values({ id: `read-${id}`, dealId: id, readerUserId: cust, createdAt: 1 });
  }
  await d.insert(schema.payments).values({ id: `${an}-pay`, userId: an, amount: 100, tierAfter: 2, createdAt: 1 });
  await d.insert(schema.placementInvoices).values({ id: `${an}-inv`, userId: an, invoiceId: `${an}-inv-id`, amount: 100, status: "success", createdAt: 1, updatedAt: 1 });
  await addReview(an, { performerId: `me-${perf2}`, dealId: `${an}-d1`, stars: 5, text: "Чудово", author: "Анна" });
  await addReview(cust, { performerId: `me-${an}`, dealId: `${an}-d2`, stars: 4, text: "Добре", author: "Олег" });
  // Телеметрія.
  await ctx.telemetry.prepare("insert into events (id, ts, received_at, name, source, session_id, user_id) values (?, 1, 1, 'x', 'client', 's', ?)").bind(`${an}-ev`, an).run();
  await ctx.telemetry.prepare("insert into logs (id, created_at, level, source, event, fingerprint, user_id) values (?, 1, 'info', 'server', 'e', 'f', ?)").bind(`${an}-lg`, an).run();
  return { email, cust, perf1, perf2, cust2, bare: bare.id, kept: kept.id, asPerformer: asPerformer.id, requestId: request.id };
};

const LOSSLESS = ["deals", "payments", "reviews", "dealPayments", "dealComplaints", "placementInvoices", "moderationActions", "cryptoProofs", "users"] as const;

describe("видалення «багатого» акаунта: що з кожною таблицею", () => {
  let seed: Awaited<ReturnType<typeof seedRich>>;
  let before: Record<string, number>;
  let bystander: number;
  const an = "rich-an";

  beforeAll(async () => {
    seed = await seedRich(an);
    // Сторонній акаунт: його дані видалення зачепити не повинно.
    const other = await makeUser(ctx.db, "rich-other");
    await createRequest(other, { text: "Запит стороннього", budget: null, deadline: null, cityId: null, tags: [], files: [] });
    await saveProfile(other, { ...emptyProfile("Інший"), cityId: "kyiv", specialty: "Код", published: true });
    bystander = (await count("requests", mine("user_id", other))) + (await count("profiles", mine("user_id", other)));
    before = Object.fromEntries(await Promise.all(LOSSLESS.map(async (name) => [name, await count(name)])));
    expect(await deleteAccount(an, NOW)).toEqual({ kind: "deleted" });
  });

  it("users: рядок лишається, особисте порожнє, deleted_at стоїть", async () => {
    const [row] = await db().select().from(schema.users).where(eq(schema.users.id, an));
    expect(row).toMatchObject({ id: an, email: tombstoneEmail(an), displayName: null, avatarUrl: null, googleId: null, emailVerifiedAt: null, lastLoginAt: null, deletedAt: NOW });
  });

  it.each([
    ["sessions", "user_id"], ["emailCodes", "user_id"], ["presence", "user_id"], ["telegramLinks", "user_id"], ["telegramLinkTokens", "user_id"], ["notificationPreferences", "user_id"],
    ["notificationLog", "user_id"], ["payoutAccounts", "user_id"], ["payoutRequisites", "user_id"], ["walletChallenges", "user_id"], ["dealReleaseCodes", "user_id"], ["adminTotpState", "user_id"],
    ["tagProposalUses", "user_id"], ["profiles", "user_id"], ["profileTags", "user_id"], ["projects", "user_id"], ["requests", "user_id"], ["responses", "performer_user_id"],
  ])("%s: рядків людини не лишилось", async (table, column) => {
    expect(await count(table as keyof typeof schema, mine(column, an))).toBe(0);
  });

  it("auth_attempts за її поштою прибрані", async () => {
    expect(await count("authAttempts", `where key = 'email:${seed.email}'`)).toBe(0);
  });

  it("запит, його теги, файли, пост у каналі й чужі відгуки на нього зникли, пост видалено в Telegram", async () => {
    expect(await count("requestTags", mine("request_id", seed.requestId))).toBe(0);
    expect(await count("requestFiles", mine("request_id", seed.requestId))).toBe(0);
    expect(await count("requestFiles", mine("uploader_user_id", an))).toBe(0);
    expect(await keysOf("requests/")).toEqual([]);
    expect(await count("channelPosts", mine("request_id", seed.requestId))).toBe(0);
    expect(await count("responses", mine("request_id", seed.requestId))).toBe(0);
    expect(telegram.deleted).toContain(777);
  });

  it("роботи профілю й їхні теги зникли, фото в R2 прибрані", async () => {
    expect(await count("projectTags")).toBe(0);
    expect(await keysOf(`photos/${an}/`)).toEqual([]);
  });

  it("розмова без угоди зникла з повідомленнями, фото й файлом у R2; розмови з угодою лишилися цілими", async () => {
    expect(await count("conversations", mine("id", seed.bare))).toBe(0);
    expect(await count("messages", mine("conversation_id", seed.bare))).toBe(0);
    expect(await count("chatAttachments", mine("conversation_id", seed.bare))).toBe(0);
    expect(await keysOf(`chat/${seed.bare}/`)).toEqual([]);
    for (const id of [seed.kept, seed.asPerformer]) {
      expect(await count("conversations", mine("id", id))).toBe(1);
      expect(await count("messages", mine("conversation_id", id))).toBeGreaterThan(0);
    }
    expect(await count("chatAttachments", mine("conversation_id", seed.kept))).toBe(1);
    expect(await keysOf(`chat/${seed.kept}/`)).toHaveLength(1);
  });

  it("згоди: лишається найновіша на документ, без хеша IP", async () => {
    const rows = await db().select().from(schema.legalAcceptances).where(eq(schema.legalAcceptances.userId, an));
    expect(rows.map((row) => `${row.doc}:${row.version}`).sort()).toEqual(["privacy:2026-11-13", "terms:2026-11-13"]);
    expect(rows.every((row) => row.ipHash === null)).toBe(true);
  });

  it("угоди, платежі, відгуки, скарги, рахунки розміщення: жоден рядок не втрачено (каскади не спрацювали)", async () => {
    for (const name of LOSSLESS) expect(await count(name), name).toBe(before[name]);
  });

  it("угоди: ім'я виконавця замінене лише там, де він пішов; прості скасовано", async () => {
    const read = async (id: string) => JSON.parse((await db().select().from(schema.deals).where(eq(schema.deals.id, id)))[0].data) as Deal;
    expect((await read(`${an}-d1`)).performer.name).toBe(`Імʼя ${an}-perf2`);
    for (const id of ["d2", "d3", "d5"]) {
      const deal = await read(`${an}-${id}`);
      expect(deal.performer).toMatchObject({ name: DELETED_NAME, specialty: "" });
      expect(deal.performer.photo).toBeUndefined();
    }
    expect((await read(`${an}-d2`)).status).toBe("completed");
    expect((await read(`${an}-d4`)).status).toBe("cancelled");
    expect((await read(`${an}-d5`)).status).toBe("cancelled");
    expect((await db().select().from(schema.deals).where(eq(schema.deals.id, `${an}-d5`)))[0].status).toBe("cancelled");
  });

  it("знімок реквізитів: закрита угода без скарг стерта, зі скаргою лишається", async () => {
    expect(await count("dealRequisites", mine("deal_id", `${an}-d2`))).toBe(0);
    expect(await count("requisiteReads", mine("deal_id", `${an}-d2`))).toBe(0);
    expect(await count("dealRequisites", mine("deal_id", `${an}-d3`))).toBe(1);
  });

  it("відгуки: свій підписаний «Замовник», відгук про неї лишається в базі", async () => {
    const [own] = await db().select().from(schema.reviews).where(eq(schema.reviews.authorUserId, an));
    expect(own.author).toBe("Замовник");
    expect(await count("reviews", mine("performer_id", `me-${an}`))).toBe(1);
  });

  it("співрозмовник бачить «Видалений користувач» замість імені", async () => {
    const list = await listConversations(`${an}-cust`);
    expect(list.find((item) => item.id === seed.asPerformer)?.other.name).toBe(DELETED_NAME);
  });

  it("телеметрія: user_id прибрано з подій і журналу", async () => {
    expect(await ctx.telemetry.prepare("select count(*) as n from events where user_id = ?").bind(an).first<{ n: number }>()).toEqual({ n: 0 });
    expect(await ctx.telemetry.prepare("select count(*) as n from logs where user_id = ?").bind(an).first<{ n: number }>()).toEqual({ n: 0 });
  });

  it("чужі дані не зачеплено", async () => {
    expect((await count("requests", mine("user_id", "rich-other"))) + (await count("profiles", mine("user_id", "rich-other")))).toBe(bystander);
  });

  it("повторне видалення безпечне, невідомий id не падає", async () => {
    expect(await deleteAccount(an, NOW + 1)).toEqual({ kind: "already" });
    expect(await deleteAccount("no-such-user", NOW)).toEqual({ kind: "missing" });
    const [row] = await db().select().from(schema.users).where(eq(schema.users.id, an));
    expect(row.deletedAt).toBe(NOW);
  });

  it("строк зберігання: знімок у угоді зі скаргою стирається через 3 роки від останньої зміни угоди, і лише коли скаргу закрито", async () => {
    // Анонімізація при видаленні теж зміна угоди (updated_at = NOW), тож 3 роки рахуються від видалення: лише довше, ніж обіцяно.
    const due = NOW + 3 * 365 * 24 * 3600 * 1000;
    expect(await purgeExpiredRequisites(due - 1)).toBe(0);
    await seedComplaint(`${an}-d3`, seed.cust2, "open");
    expect(await purgeExpiredRequisites(due)).toBe(0);
    expect(await count("dealRequisites", mine("deal_id", `${an}-d3`))).toBe(1);
    await ctx.db.prepare("delete from deal_complaints where id = ?").bind(`cmp_${an}-d3_open`).run();
    expect(await purgeExpiredRequisites(due)).toBe(1);
    expect(await count("dealRequisites", mine("deal_id", `${an}-d3`))).toBe(0);
    expect(await count("requisiteReads", mine("deal_id", `${an}-d3`))).toBe(0);
  });

  it("строк зберігання не чіпає реквізити живого виконавця", async () => {
    const live = await makeUser(ctx.db, "live-perf");
    await makeUser(ctx.db, "live-cust");
    await seedDeal({ id: "live-d", owner: "live-cust", performer: live, status: "completed", stages: ["released"], updatedAt: 100 });
    await ctx.db.prepare("insert into deal_requisites (deal_id, cipher, mask, created_at) values ('live-d', 'c', 'm', 1)").run();
    await purgeExpiredRequisites(NOW * 10);
    expect(await count("dealRequisites", mine("deal_id", "live-d"))).toBe(1);
  });
});

describe("що блокує видалення: нічого не змінюється", () => {
  const cases: [string, (id: string, partner: string) => Promise<unknown>, "money" | "complaint"][] = [
    ["безпечна угода: гроші заморожено", (id, p) => seedDeal({ id: `${id}-d`, owner: id, performer: p, method: "safe", stages: ["funded"] }), "money"],
    ["безпечна угода: етап здано", (id, p) => seedDeal({ id: `${id}-d`, owner: id, performer: p, method: "safe", stages: ["delivered"] }), "money"],
    ["безпечна угода: спір", (id, p) => seedDeal({ id: `${id}-d`, owner: id, performer: p, method: "safe", stages: ["disputed"] }), "money"],
    ["безпечна угода: виплата в дорозі", (id, p) => seedDeal({ id: `${id}-d`, owner: id, performer: p, method: "safe", stages: ["releasing"] }), "money"],
    ["прямий переказ: «я оплатив» чекає підтвердження", (id, p) => seedDeal({ id: `${id}-d`, owner: id, performer: p, stages: ["claimed"] }), "money"],
    ["ескроу не закрите", (id, p) => seedDeal({ id: `${id}-d`, owner: id, performer: p, method: "escrow", stages: ["pending"], escrow: true }), "money"],
    ["живий рахунок у банку на прийнятій угоді", async (id, p) => (await seedDeal({ id: `${id}-d`, owner: id, performer: p, method: "safe", stages: ["pending"] }), seedBankInvoice(`${id}-d`, "created")), "money"],
    ["відкрита скарга на завершену угоду", async (id, p) => (await seedDeal({ id: `${id}-d`, owner: id, performer: p, status: "completed", stages: ["released"] }), seedComplaint(`${id}-d`, p)), "complaint"],
  ];

  it.each(cases)("замовник: %s", async (name, arrange, kind) => {
    const id = `blk-c-${cases.findIndex((item) => item[0] === name)}`;
    const partner = await makeUser(ctx.db, `${id}-p`);
    await makeUser(ctx.db, id);
    await saveProfile(id, { ...emptyProfile("Блок"), cityId: "kyiv", specialty: "x", published: true });
    await arrange(id, partner);
    const result = await deleteAccount(id, NOW);
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") expect(result.blockers.map((blocker) => blocker.kind)).toContain(kind);
    const [row] = await db().select().from(schema.users).where(eq(schema.users.id, id));
    expect(row).toMatchObject({ email: `${id}@example.com`, deletedAt: null });
    expect(await count("profiles", mine("user_id", id))).toBe(1);
  });

  it("виконавець теж блокується, а блокер веде до угоди", async () => {
    const perf = await makeUser(ctx.db, "blk-perf");
    const customer = await makeUser(ctx.db, "blk-perf-cust");
    const conversation = await getOrCreateConversation(customer, `me-${perf}`, perf);
    await seedDeal({ id: "blk-perf-d", owner: customer, performer: perf, method: "safe", stages: ["delivered"] });
    const blockers = await deleteBlockers(perf);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatchObject({ kind: "money", dealId: "blk-perf-d", conversationId: conversation.id });
    expect(blockers[0].reason).toContain("#");
  });

  it("закриті угоди й вільна пропозиція не блокують", async () => {
    const id = await makeUser(ctx.db, "free-an");
    const p = await makeUser(ctx.db, "free-p");
    await seedDeal({ id: "free-d1", owner: id, performer: p, status: "completed", stages: ["released"] });
    await seedDeal({ id: "free-d2", owner: id, performer: p, status: "declined" });
    await seedDeal({ id: "free-d3", owner: id, performer: p, status: "proposed" });
    expect(await deleteBlockers(id)).toEqual([]);
    expect(await deleteAccount(id, NOW)).toEqual({ kind: "deleted" });
  });
});
