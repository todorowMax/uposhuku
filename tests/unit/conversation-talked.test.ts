import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conversations, messages } from "@/db/schema";
import { addSystemMessage, listConversations } from "@/lib/server/chat-repo";
import { getDb } from "@/lib/server/db";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

describe("розмова: чи хтось писав сам", () => {
  it("розмова з самих системних рядків ще не «чат», після репліки людини так", async () => {
    const customer = await makeUser(ctx.db, "tk-customer");
    const performer = await makeUser(ctx.db, "tk-performer");
    const lone = await makeUser(ctx.db, "tk-lone");
    // Відгук і угода пишуть у розмову системні рядки й самі її створюють.
    await addSystemMessage(customer, performer, "Відгук на «Лендинг»: 2500 ₴", "req_1");
    await addSystemMessage(customer, lone, "Відгук на «Лендинг»: 900 ₴", "req_1");
    const before = await listConversations(customer);
    expect(before).toHaveLength(2);
    expect(before.every((item) => item.talked === false)).toBe(true);

    const target = before.find((item) => item.performerId === `me-${performer}`)!;
    await getDb().insert(messages).values({ id: "tk-m1", conversationId: target.id, from: "customer", text: "Добрий день", kind: "text", createdAt: Date.now() + 5 });
    // Після репліки людини системний рядок може стати останнім, а розмова лишається «чатом».
    await addSystemMessage(customer, performer, "Угоду #A1B2 запропоновано", "deal_1");
    const after = await listConversations(customer);
    expect(after.find((item) => item.id === target.id)?.talked).toBe(true);
    expect(after.find((item) => item.performerId === `me-${lone}`)?.talked).toBe(false);
    expect(await getDb().select().from(conversations)).toHaveLength(2);
  });
});
