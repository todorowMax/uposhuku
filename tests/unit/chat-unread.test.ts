import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { POST as READ } from "@/app/api/conversations/[id]/read/route";
import { messages } from "@/db/schema";
import { getOrCreateConversation, listConversations, markConversationRead } from "@/lib/server/chat-repo";
import { getDb } from "@/lib/server/db";
import { seedDeal } from "../helpers/account-fixtures";
import { makeUser, rowChunks, useTestD1 } from "../helpers/d1";
import { ctxOf, exhaust } from "../helpers/route-fixtures";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let counter = 0;
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
const post = () => new Request("https://findlyfy.test/x", { method: "POST" });

/** Нова пара «замовник + виконавець» із власними користувачами: тести не заважають одне одному. */
const pair = async () => {
  const n = ++counter;
  const customer = await makeUser(ctx.db, `un-c${n}`);
  const performer = await makeUser(ctx.db, `un-p${n}`);
  const conversation = await getOrCreateConversation(customer, `me-${performer}`, performer);
  return { customer, performer, id: conversation.id };
};
type Line = { from: "customer" | "performer"; kind?: "text" | "system"; at: number };
const write = async (conversationId: string, lines: Line[]) => {
  const rows = lines.map((line, index) => ({ id: `un-m${++counter}-${index}`, conversationId, from: line.from, text: "текст", kind: line.kind ?? ("text" as const), createdAt: line.at }));
  for (const chunk of rowChunks(rows, 7)) await getDb().insert(messages).values(chunk);
};
const view = async (userId: string, conversationId: string) => (await listConversations(userId)).find((item) => item.id === conversationId)!;

beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => as(null));

describe("непрочитане в списку розмов", () => {
  it("рахує лише текстові повідомлення другої сторони, для кожної сторони окремо", async () => {
    const { customer, performer, id } = await pair();
    await write(id, [
      { from: "performer", at: 1000 },
      { from: "performer", at: 2000 },
      { from: "customer", at: 3000 },
    ]);
    expect((await view(customer, id)).unread).toBe(2);
    expect((await view(performer, id)).unread).toBe(1);
  });

  it("власні повідомлення не рахуються", async () => {
    const { customer, performer, id } = await pair();
    await write(id, [
      { from: "customer", at: 1000 },
      { from: "customer", at: 2000 },
    ]);
    expect((await view(customer, id)).unread).toBe(0);
    expect((await view(performer, id)).unread).toBe(1 + 1);
  });

  it("звичайний службовий рядок не робить розмову непрочитаною", async () => {
    const { customer, performer, id } = await pair();
    await write(id, [{ from: "customer", kind: "system", at: 1000 }]);
    for (const user of [customer, performer]) {
      const item = await view(user, id);
      expect(item.unread).toBe(0);
      expect(item.unreadDeal).toBe(false);
    }
  });

  it("угода чекає на мене й є службовий рядок новіший за мітку: непрочитано, а після відмітки ні (needsMe лишається)", async () => {
    const { customer, performer, id } = await pair();
    await seedDeal({ id: `deal_un${counter}`, owner: customer, performer, status: "accepted", stages: ["delivered"] });
    await write(id, [{ from: "customer", kind: "system", at: 1000 }]);
    const before = await view(customer, id);
    expect(before.deal?.needsMe).toBe(true);
    expect(before.unreadDeal).toBe(true);
    expect(before.unread).toBe(0);
    // Виконавця угода не чекає: для нього той самий рядок нічого не означає.
    expect((await view(performer, id)).unreadDeal).toBe(false);
    await markConversationRead(id, "customer", 5000);
    const after = await view(customer, id);
    expect(after.unreadDeal).toBe(false);
    expect(after.deal?.needsMe).toBe(true);
  });

  it("лічильник має стелю 99", async () => {
    const { customer, id } = await pair();
    await write(id, Array.from({ length: 105 }, (_, index) => ({ from: "performer" as const, at: 1000 + index })));
    expect((await view(customer, id)).unread).toBe(99);
  });

  it("мітка однієї сторони не чіпає другу, нове повідомлення після мітки знову рахується, мітка не йде назад", async () => {
    const { customer, performer, id } = await pair();
    await write(id, [
      { from: "performer", at: 1000 },
      { from: "customer", at: 1500 },
    ]);
    await markConversationRead(id, "customer", 2000);
    expect((await view(customer, id)).unread).toBe(0);
    expect((await view(performer, id)).unread).toBe(1);
    await write(id, [{ from: "performer", at: 3000 }]);
    expect((await view(customer, id)).unread).toBe(1);
    await markConversationRead(id, "customer", 5000);
    expect((await view(customer, id)).unread).toBe(0);
    // Запізніла відмітка зі старим часом (інша вкладка, годинник іншого вузла) не повертає прочитане в непрочитане.
    await markConversationRead(id, "customer", 1000);
    expect((await view(customer, id)).unread).toBe(0);
  });
});

describe("POST /api/conversations/:id/read", () => {
  it("без входу 401, чужому 404 і його мітка не рухається", async () => {
    const { customer, id } = await pair();
    const stranger = await makeUser(ctx.db, `un-s${counter}`);
    await write(id, [{ from: "performer", at: Date.now() - 5000 }]);
    expect((await READ(post(), ctxOf({ id }))).status).toBe(401);
    as(stranger);
    expect((await READ(post(), ctxOf({ id }))).status).toBe(404);
    expect((await READ(post(), ctxOf({ id: "conv_nobody" }))).status).toBe(404);
    expect((await view(customer, id)).unread).toBe(1);
  });

  it("учасник скидає своє непрочитане, друга сторона його не втрачає", async () => {
    const { customer, performer, id } = await pair();
    await write(id, [
      { from: "performer", at: Date.now() - 5000 },
      { from: "customer", at: Date.now() - 4000 },
    ]);
    as(customer);
    expect((await READ(post(), ctxOf({ id }))).status).toBe(200);
    expect((await view(customer, id)).unread).toBe(0);
    expect((await view(performer, id)).unread).toBe(1);
  });

  it("ліміт частоти: понад правило 429", async () => {
    const { customer, id } = await pair();
    as(customer);
    await exhaust("conversationRead", customer);
    expect((await READ(post(), ctxOf({ id }))).status).toBe(429);
  });
});
