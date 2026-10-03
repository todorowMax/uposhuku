import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

describe("тестова D1", () => {
  it("піднімається, міграції застосовані, зовнішні ключі працюють", async () => {
    await makeUser(ctx.db, "u1");
    const tables = await ctx.db.prepare("select name from sqlite_master where type='table' and name not like '_cf_%' and name not like 'sqlite_%'").all<{ name: string }>();
    expect(tables.results.map((table) => table.name)).toEqual(expect.arrayContaining(["users", "sessions", "profiles", "requests", "responses", "payments", "deals", "reviews", "conversations", "messages"]));
  });
});
