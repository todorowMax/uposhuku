import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chatAttachments, conversations, dealReleaseCodes, emailCodes, messages, sessions } from "@/db/schema";
import { SESSION_IDLE_MS } from "@/lib/auth/config";
import { getDb } from "@/lib/server/db";
import { ORPHAN_ATTACHMENT_MS, pruneEmailCodes, pruneOrphanAttachments, pruneReleaseCodes, pruneSessions } from "@/lib/server/tick-cleanup";
import { getBucket } from "@/lib/server/uploads";
import { makeUser, useTestD1 } from "../helpers/d1";

const NOW = Date.UTC(2026, 10, 14, 12, 0);
const DAY = 24 * 60 * 60 * 1000;
let ctx: Awaited<ReturnType<typeof useTestD1>>;

beforeAll(async () => {
  ctx = await useTestD1();
  await makeUser(ctx.db, "c1");
  await makeUser(ctx.db, "c2");
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  const db = getDb();
  await db.delete(chatAttachments);
  await db.delete(messages);
  await db.delete(conversations);
  await db.delete(sessions);
  await db.delete(emailCodes);
  await db.delete(dealReleaseCodes);
});

const ids = async (table: typeof sessions | typeof emailCodes | typeof dealReleaseCodes) => (await getDb().select({ id: table.id }).from(table)).map((row) => row.id).sort();

describe("сесії", () => {
  it("прибирає прострочені й неактивні 14 днів, живу не чіпає", async () => {
    const row = (id: string, expiresAt: number, lastSeenAt: number) => ({ id, userId: "c1", via: "email" as const, createdAt: NOW - 20 * DAY, expiresAt, lastSeenAt });
    await getDb().insert(sessions).values([
      row("live", NOW + 10 * DAY, NOW - DAY),
      row("expired", NOW - 1, NOW - DAY),
      row("idle", NOW + 10 * DAY, NOW - SESSION_IDLE_MS - 1),
      row("edge", NOW + 10 * DAY, NOW - SESSION_IDLE_MS),
    ]);
    expect(await pruneSessions(NOW)).toBe(2);
    expect(await ids(sessions)).toEqual(["edge", "live"]);
    expect(await pruneSessions(NOW)).toBe(0);
  });
});

describe("коди", () => {
  it("прострочені коди входу прибираються, чинні лишаються", async () => {
    await getDb().insert(emailCodes).values([
      { id: "old", userId: "c1", codeHash: "h", createdAt: NOW - DAY, expiresAt: NOW - 1 },
      { id: "fresh", userId: "c2", codeHash: "h", createdAt: NOW - 1000, expiresAt: NOW + 1000 },
    ]);
    expect(await pruneEmailCodes(NOW)).toBe(1);
    expect(await ids(emailCodes)).toEqual(["fresh"]);
  });

  it("прострочені коди приймання етапу прибираються, чинні лишаються", async () => {
    await getDb().insert(dealReleaseCodes).values([
      { id: "old", userId: "c1", dealId: "d1", stageId: "s1", codeHash: "h", createdAt: NOW - DAY, expiresAt: NOW - 1 },
      { id: "fresh", userId: "c1", dealId: "d1", stageId: "s2", codeHash: "h", createdAt: NOW - 1000, expiresAt: NOW + 1000 },
    ]);
    expect(await pruneReleaseCodes(NOW)).toBe(1);
    expect(await ids(dealReleaseCodes)).toEqual(["fresh"]);
  });
});

describe("осиротілі фото чату", () => {
  const photo = (id: string, messageId: string | null, createdAt: number) => ({ id, conversationId: "conv_t", uploaderUserId: "c1", messageId, key: `chat/conv_t/${id}.jpg`, mime: "image/jpeg", bytes: 3, createdAt });

  it("без повідомлення й старше доби: файл з R2 і рядок зникають; прикріплені й свіжі лишаються", async () => {
    const db = getDb();
    await db.insert(conversations).values({ id: "conv_t", customerUserId: "c1", performerId: "p1", performerUserId: "c2", createdAt: NOW, updatedAt: NOW });
    await db.insert(messages).values({ id: "m1", conversationId: "conv_t", from: "customer", text: "x", kind: "text", createdAt: NOW });
    await db.insert(chatAttachments).values([
      photo("orphan", null, NOW - ORPHAN_ATTACHMENT_MS - 1),
      photo("fresh", null, NOW - 1000),
      photo("attached", "m1", NOW - 5 * DAY),
    ]);
    for (const id of ["orphan", "fresh", "attached"]) await getBucket().put(`chat/conv_t/${id}.jpg`, new Uint8Array([1, 2, 3]));

    expect(await pruneOrphanAttachments(NOW)).toBe(1);
    expect((await db.select({ id: chatAttachments.id }).from(chatAttachments)).map((row) => row.id).sort()).toEqual(["attached", "fresh"]);
    expect(await getBucket().head("chat/conv_t/orphan.jpg")).toBeNull();
    expect(await getBucket().head("chat/conv_t/fresh.jpg")).not.toBeNull();
    expect(await getBucket().head("chat/conv_t/attached.jpg")).not.toBeNull();
    expect(await pruneOrphanAttachments(NOW)).toBe(0);
  });
});
