import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ONLINE_TTL, isOnline, markPresence, onlineUsers } from "@/lib/server/presence-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(() => ctx.close());

describe("присутність", () => {
  it("онлайн, поки є свіжий пульс, і офлайн після виходу", async () => {
    const id = await makeUser(ctx.db, "pres-a");
    const now = Date.now();
    await markPresence(ctx.db, id, true, now);
    expect((await onlineUsers(now + 1000)).has(id)).toBe(true);
    await markPresence(ctx.db, id, false, now + 2000);
    expect((await onlineUsers(now + 3000)).has(id)).toBe(false);
  });

  it("без пульсу довше за TTL людина вважається офлайн, хоч прапорець стоїть", async () => {
    const id = await makeUser(ctx.db, "pres-b");
    const now = Date.now();
    await markPresence(ctx.db, id, true, now);
    expect((await onlineUsers(now + ONLINE_TTL - 1)).has(id)).toBe(true);
    expect((await onlineUsers(now + ONLINE_TTL + 1)).has(id)).toBe(false);
  });

  it("isOnline відповідає для окремої людини", async () => {
    const id = await makeUser(ctx.db, "pres-c");
    await markPresence(ctx.db, id, true);
    expect(await isOnline(id)).toBe(true);
    expect(await isOnline("nobody")).toBe(false);
  });
});
