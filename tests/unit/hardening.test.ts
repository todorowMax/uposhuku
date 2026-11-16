import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: { id: "hd-user", email: "hd-user@example.com", name: null } as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq, like } from "drizzle-orm";
import { POST as UPLOAD } from "@/app/api/uploads/route";
import { authAttempts, dealReleaseCodes, emailCodes } from "@/db/schema";
import { reviewAuthor } from "@/lib/reviews/author";
import { encodeCursor } from "@/lib/chat/cursor";
import { addMessage, getOrCreateConversation, listMessages, listMessagesPage, MESSAGES_PAGE } from "@/lib/server/chat-repo";
import { getDb } from "@/lib/server/db";
import { overLimit, RATE_RULES } from "@/lib/server/rate-limit";
import { readBodyLimited } from "@/lib/server/read-body";
import { verifyReleaseCode } from "@/lib/server/release-code";
import { verifyEmailLogin } from "@/lib/server/auth";
import { PHOTO_MAX_BYTES } from "@/lib/server/uploads";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  process.env.MAIL_MODE = "dev";
  ctx = await useTestD1();
  for (const id of ["hd-user", "hd-cust", "hd-perf", "hd-code"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});

const streamOf = (chunks: number, size: number) => {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ >= chunks) return controller.close();
      controller.enqueue(new Uint8Array(size));
    },
  });
};

describe("атомарні лічильники", () => {
  it("паралельні звернення не дають більше пропусків, ніж ліміт", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => overLimit("dealPay", "burst-user")));
    expect(results.filter((over) => !over)).toHaveLength(RATE_RULES.dealPay.max);
  });

  it("спроби коду входу: паралельні помилки не перевищують ні ліміт коду, ні ліміт пошти", async () => {
    const db = getDb();
    await db.insert(emailCodes).values({ id: "ec-1", userId: "hd-user", codeHash: "x".repeat(64), createdAt: Date.now(), expiresAt: Date.now() + 600_000 });
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => verifyEmailLogin("hd-user@example.com", String(100000 + index), "1.2.3.4")));
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
    const [stored] = await db.select().from(emailCodes).where(eq(emailCodes.id, "ec-1"));
    expect(stored.attempts).toBe(5);
    const rows = await db.select().from(authAttempts).where(like(authAttempts.key, "email:hd-user%"));
    expect(rows.length).toBeLessThanOrEqual(8);
  });

  it("код приймання: після паралельного перебору правильний код уже не приймається", async () => {
    const target = { userId: "hd-code", dealId: "d-1", stageId: "s-1" };
    const hash = async (code: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hd-code:d-1:s-1:${code}`))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await getDb().insert(dealReleaseCodes).values({ id: "rc-1", ...target, codeHash: await hash("123456"), createdAt: Date.now(), expiresAt: Date.now() + 600_000 });
    await Promise.all(Array.from({ length: 20 }, (_, index) => verifyReleaseCode(target, String(100000 + index))));
    const [stored] = await getDb().select().from(dealReleaseCodes).where(eq(dealReleaseCodes.id, "rc-1"));
    expect(stored.attempts).toBe(5);
    expect(await verifyReleaseCode(target, "123456")).toBe("expired");
  });
});

describe("підпис автора відгуку", () => {
  it("береться з імені профілю, а не з пошти", () => {
    expect(reviewAuthor("Олена Коваль")).toBe("Олена");
    expect(reviewAuthor(null)).toBe("Замовник");
    expect(reviewAuthor("  ")).toBe("Замовник");
  });
});

describe("ліміт розміру тіла", () => {
  it("потік без content-length обривається на стелі", async () => {
    const big = new Request("https://findlyfy.test/x", { method: "POST", body: streamOf(50, 1000), duplex: "half" } as RequestInit);
    expect(await readBodyLimited(big, 10_000)).toBeNull();
    const small = new Request("https://findlyfy.test/x", { method: "POST", body: streamOf(3, 1000), duplex: "half" } as RequestInit);
    expect((await readBodyLimited(small, 10_000))?.byteLength).toBe(3000);
  });

  it("/api/uploads дає 413 на потік без content-length", async () => {
    const request = new Request("https://findlyfy.test/api/uploads", { method: "POST", body: streamOf(10, PHOTO_MAX_BYTES), duplex: "half", headers: { "content-type": "image/jpeg" } } as RequestInit);
    expect((await UPLOAD(request)).status).toBe(413);
  });
});

describe("довгий розмова", () => {
  it("перше завантаження дає найновіші 500, опитування від мітки дає нові", async () => {
    const conv = await getOrCreateConversation("hd-cust", "me-hd-perf", "hd-perf");
    const base = Date.now() - 10_000_000;
    const rows = Array.from({ length: 600 }, (_, index) => ({ id: `bulk-${index}`, conversationId: conv.id, from: "customer" as const, text: `m${index}`, kind: "text" as const, contextId: null, createdAt: base + index }));
    for (let start = 0; start < rows.length; start += 10) await ctx.db.batch(rows.slice(start, start + 10).map((row) => ctx.db.prepare("insert into messages (id, conversation_id, \"from\", text, kind, context_id, created_at) values (?, ?, ?, ?, ?, ?, ?)").bind(row.id, row.conversationId, row.from, row.text, row.kind, row.contextId, row.createdAt)));
    const first = await listMessages(conv.id);
    expect(first).toHaveLength(500);
    expect(first[0].text).toBe("m100");
    expect(first[499].text).toBe("m599");
    const fresh = await addMessage(conv.id, "performer", "нове");
    const incremental = await listMessages(conv.id, base + 599);
    expect(incremental.map((message) => message.text)).toEqual(["нове"]);
    expect(Date.parse(fresh.at)).toBeGreaterThan(base + 599);
  });

  it("«показати раніше»: перша сторінка каже hasMore, before віддає решту без пропусків і повторів навіть при однаковому часі на межі", async () => {
    const conv = await getOrCreateConversation("hd-cust", "me-hd-perf-tie", "hd-perf");
    const at = Date.now() - 5_000_000;
    // Усі 700 з однією мілісекундою: межа сторінки лягає всередину групи однакового часу.
    const total = MESSAGES_PAGE + 200;
    const rows = Array.from({ length: total }, (_, index) => ({ id: `tie-${String(index).padStart(4, "0")}`, text: `t${index}` }));
    // Порціями по 100 запитів у одному batch: сімсот окремих звернень на завантаженій машині не вкладались у таймаут.
    for (let start = 0; start < rows.length; start += 100) {
      await ctx.db.batch(rows.slice(start, start + 100).map((row) => ctx.db.prepare("insert into messages (id, conversation_id, \"from\", text, kind, context_id, created_at) values (?, ?, ?, ?, 'text', null, ?)").bind(row.id, conv.id, "customer", row.text, at)));
    }
    const first = await listMessagesPage(conv.id);
    expect(first.messages).toHaveLength(MESSAGES_PAGE);
    expect(first.hasMore).toBe(true);
    expect(first.messages[0].id).toBe("tie-0200");
    const older = await listMessagesPage(conv.id, { before: { at: Date.parse(first.messages[0].at), id: first.messages[0].id } });
    expect(older.hasMore).toBe(false);
    expect(older.messages).toHaveLength(200);
    const ids = [...older.messages, ...first.messages].map((message) => message.id);
    expect(new Set(ids).size).toBe(total);
    expect(ids).toEqual([...ids].sort());
    // Курсор на найстаріше повідомлення групи нічого не повертає.
    expect(await listMessagesPage(conv.id, { before: { at, id: "tie-0000" } })).toEqual({ messages: [], hasMore: false });
    expect(encodeCursor(first.messages[0])).toBe(`${at}:tie-0200`);
  });

  it("опитування від мітки не залежить від before: hasMore хибне, порядок зростаючий", async () => {
    const conv = await getOrCreateConversation("hd-cust", "me-hd-perf-poll", "hd-perf");
    const at = Date.now() - 4_000_000;
    for (const [index, id] of ["p-b", "p-a", "p-c"].entries()) {
      await ctx.db.prepare("insert into messages (id, conversation_id, \"from\", text, kind, context_id, created_at) values (?, ?, ?, ?, 'text', null, ?)").bind(id, conv.id, "customer", id, at + (index === 2 ? 5 : 0)).run();
    }
    const page = await listMessagesPage(conv.id, { since: at - 1 });
    expect(page.messages.map((message) => message.id)).toEqual(["p-a", "p-b", "p-c"]);
    expect(page.hasMore).toBe(false);
  });
});
