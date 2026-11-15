import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { addMessage, addSystemMessage, listConversations } from "@/lib/server/chat-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

describe("список розмов: превʼю й підпис", () => {
  it("lastHumanMessage це остання репліка людини, навіть коли останнім стоїть службовий рядок", async () => {
    const customer = await makeUser(ctx.db, "lr-c1");
    const performer = await makeUser(ctx.db, "lr-p1");
    await addSystemMessage(customer, performer, "Угоду #AAAA запропоновано", "deal_lr1");
    const [conversation] = await listConversations(customer);
    expect(conversation.lastHumanMessage).toBeNull();
    await addMessage(conversation.id, "customer", "Добрий день");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await addSystemMessage(customer, performer, "Угоду #AAAA прийнято", "deal_lr1");
    const [after] = await listConversations(customer);
    expect(after.lastMessage?.kind).toBe("system");
    expect(after.lastHumanMessage).toMatchObject({ text: "Добрий день", from: "customer" });
  });

  it("замовник без імені позначений nameless, з іменем ні", async () => {
    const nameless = await makeUser(ctx.db, "lr-c2");
    const named = await makeUser(ctx.db, "lr-c3");
    const performer = await makeUser(ctx.db, "lr-p2");
    await getDb().update(users).set({ displayName: null }).where(eq(users.id, nameless));
    await getDb().update(users).set({ displayName: "Олена" }).where(eq(users.id, named));
    await addSystemMessage(nameless, performer, "Відгук на «Лендинг»", "req_lr");
    await addSystemMessage(named, performer, "Відгук на «Лендинг»", "req_lr");
    const list = await listConversations(performer);
    expect(list.filter((item) => item.other.nameless)).toHaveLength(1);
    expect(list.filter((item) => item.other.name === "Олена" && !item.other.nameless)).toHaveLength(1);
  });
});
