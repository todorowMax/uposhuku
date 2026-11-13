// Маршрути /api/account/export і /api/account/delete: доступ, ліміт, вміст виписки, код для тих, у кого були угоди.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null, closed: 0 }));
vi.mock("@/lib/server/auth", () => ({
  getSessionUser: async () => session.user,
  closeSession: async () => void session.closed++,
  devCode: () => ({ code: "000000", private: false }),
}));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: () => null, pushGlobal: vi.fn() }));

import { eq } from "drizzle-orm";
import { GET as EXPORT } from "@/app/api/account/export/route";
import { GET as STATUS, POST as DELETE } from "@/app/api/account/delete/route";
import { POST as SEND_CODE } from "@/app/api/account/delete/code/route";
import { users } from "@/db/schema";
import { emptyProfile } from "@/lib/profile/types";
import { getDb } from "@/lib/server/db";
import { saveProfile } from "@/lib/server/profile-repo";
import { addReview } from "@/lib/server/review-repo";
import { exhaust } from "../helpers/route-fixtures";
import { seedComplaint, seedDeal } from "../helpers/account-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["ar-me", "ar-other", "ar-solo", "ar-money", "ar-rate", "ar-deals"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  session.closed = 0;
  session.user = null;
});

const as = (id: string) => (session.user = { id, email: `${id}@example.com`, name: null });
const post = (body: unknown) => new Request("https://findlyfy.test/api/account/delete", { method: "POST", body: JSON.stringify(body) });
const request = (url: string) => new Request(`https://findlyfy.test${url}`);
const deletedAt = async (id: string) => (await getDb().select().from(users).where(eq(users.id, id)))[0].deletedAt;

describe("GET /api/account/export", () => {
  it("без входу 401", async () => {
    expect((await EXPORT(request("/api/account/export"))).status).toBe(401);
  });

  it("віддає файл для завантаження, no-store, без чужого й без секретів", async () => {
    await saveProfile("ar-me", { ...emptyProfile("Мій профіль"), cityId: "lviv", specialty: "Код", published: true });
    await saveProfile("ar-other", { ...emptyProfile("Чужий профіль"), cityId: "kyiv", specialty: "Секретна спеціальність", published: true });
    await getDb().insert((await import("@/db/schema")).sessions).values({ id: "ar-me-jti-secret", userId: "ar-me", via: "email", createdAt: 1, expiresAt: 2, lastSeenAt: 1 });
    await getDb().insert((await import("@/db/schema")).emailCodes).values({ id: "ar-code", userId: "ar-me", codeHash: "deadbeefhash", createdAt: 1, expiresAt: 2 });
    await getDb().insert((await import("@/db/schema")).payoutRequisites).values({ userId: "ar-me", cipher: "CIPHERTEXT-VALUE", mask: "UA21…6001", createdAt: 1, updatedAt: 1 });
    // Я замовник, виконавець угоди: чужа людина, її ім'я й id в виписку не потрапляють.
    await seedDeal({ id: "ar-d1", owner: "ar-me", performer: "ar-other", status: "completed", stages: ["released"] });
    await addReview("ar-me", { performerId: "me-ar-other", dealId: "ar-d1", stars: 5, text: "Чудово", author: "Мій підпис" });
    await addReview("ar-other", { performerId: "me-ar-me", dealId: "ar-d1x", stars: 3, text: "Відгук про мене", author: "Ім'я чужого" });
    as("ar-me");
    const response = await EXPORT(request("/api/account/export"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="findlyfy-my-data-\d{4}-\d{2}-\d{2}\.json"$/);
    const text = await response.text();
    const data = JSON.parse(text) as { account: { email: string }; profile: { name: string }; deals: { performer: { name: string }; role: string }[]; reviews: { author: string; written: boolean }[] };
    expect(data.account.email).toBe("ar-me@example.com");
    expect(data.profile.name).toBe("Мій профіль");
    expect(data.deals[0]).toMatchObject({ role: "customer", performer: { name: "Інша сторона" } });
    expect(data.reviews.find((item) => !item.written)?.author).toBe("Замовник");
    for (const forbidden of ["ar-other", "Чужий профіль", "Секретна спеціальність", "Ім'я чужого", "ar-me-jti-secret", "deadbeefhash", "CIPHERTEXT-VALUE", "codeHash"]) expect(text, forbidden).not.toContain(forbidden);
  });

  it("не більше трьох виписок на годину", async () => {
    as("ar-rate");
    await exhaust("accountExport", "ar-rate");
    expect((await EXPORT(request("/api/account/export"))).status).toBe(429);
  });
});

describe("/api/account/delete", () => {
  it("без входу 401, на всіх трьох маршрутах", async () => {
    expect((await STATUS(request("/api/account/delete"))).status).toBe(401);
    expect((await DELETE(post({ confirm: "ВИДАЛИТИ" }))).status).toBe(401);
    expect((await SEND_CODE(post({}))).status).toBe(401);
  });

  it("без правильного слова 400, акаунт на місці", async () => {
    as("ar-solo");
    expect((await DELETE(post({ confirm: "так" }))).status).toBe(400);
    expect((await DELETE(post({}))).status).toBe(400);
    expect(await deletedAt("ar-solo")).toBeNull();
  });

  it("людина без угод видаляється одним словом, сесія закривається, повтор не ламається", async () => {
    as("ar-solo");
    expect(await (await STATUS(request("/api/account/delete"))).json()).toEqual({ blockers: [], needsCode: false });
    const done = await DELETE(post({ confirm: "видалити" }));
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ deleted: true });
    expect(session.closed).toBe(1);
    expect(await deletedAt("ar-solo")).not.toBeNull();
    expect((await DELETE(post({ confirm: "ВИДАЛИТИ" }))).status).toBe(200);
  });

  it("гроші в русі: 409 зі списком, нічого не видалено", async () => {
    await seedDeal({ id: "ar-money-d", owner: "ar-money", performer: "ar-other", method: "safe", stages: ["funded"] });
    as("ar-money");
    const status = (await (await STATUS(request("/api/account/delete"))).json()) as { blockers: unknown[] };
    expect(status.blockers).toHaveLength(1);
    const refused = await DELETE(post({ confirm: "ВИДАЛИТИ", code: "000000" }));
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as { blockers: Record<string, unknown>[] };
    expect(body).toMatchObject({ code: "delete_blocked" } as object);
    expect(body.blockers[0]).toMatchObject({ kind: "money", dealId: "ar-money-d" });
    expect(await deletedAt("ar-money")).toBeNull();
    expect(session.closed).toBe(0);
  });

  it("у кого були угоди, потрібен код з пошти: без коду й з чужим кодом 403, з правильним 200", async () => {
    await seedDeal({ id: "ar-deals-d", owner: "ar-deals", performer: "ar-other", status: "completed", stages: ["released"] });
    as("ar-deals");
    expect(((await (await STATUS(request("/api/account/delete"))).json()) as { needsCode: boolean }).needsCode).toBe(true);
    expect((await DELETE(post({ confirm: "ВИДАЛИТИ" }))).status).toBe(403);
    expect((await SEND_CODE(post({}))).status).toBe(200);
    expect((await DELETE(post({ confirm: "ВИДАЛИТИ", code: "111111" }))).status).toBe(403);
    expect(await deletedAt("ar-deals")).toBeNull();
    const done = await DELETE(post({ confirm: "ВИДАЛИТИ", code: "000000" }));
    expect(done.status).toBe(200);
    expect(await deletedAt("ar-deals")).not.toBeNull();
  });

  it("код не потрібен тому, хто без угод", async () => {
    await makeUser(ctx.db, "ar-nodeal");
    as("ar-nodeal");
    expect((await SEND_CODE(post({}))).status).toBe(409);
  });

  it("чужа відкрита скарга теж блокує, а закрита ні", async () => {
    await makeUser(ctx.db, "ar-cmp");
    await seedDeal({ id: "ar-cmp-d", owner: "ar-cmp", performer: "ar-other", status: "completed", stages: ["released"] });
    await seedComplaint("ar-cmp-d", "ar-other", "open");
    as("ar-cmp");
    expect((await STATUS(request("/api/account/delete"))).status).toBe(200);
    expect(((await (await STATUS(request("/api/account/delete"))).json()) as { blockers: { kind: string }[] }).blockers[0].kind).toBe("complaint");
  });
});

describe("розмова з тим, хто видалив акаунт", () => {
  it("писати йому й виставляти умови не можна: 409", async () => {
    const { POST: SEND } = await import("@/app/api/conversations/[id]/messages/route");
    const { POST: DEAL } = await import("@/app/api/conversations/[id]/deals/route");
    const { getOrCreateConversation } = await import("@/lib/server/chat-repo");
    const { deleteAccount } = await import("@/lib/server/account-delete");
    for (const id of ["ar-chat-a", "ar-chat-b"]) await makeUser(ctx.db, id);
    const conversation = await getOrCreateConversation("ar-chat-a", "me-ar-chat-b", "ar-chat-b");
    // Розмова переживає видалення лише якщо в пари була угода.
    await seedDeal({ id: "ar-chat-d", owner: "ar-chat-a", performer: "ar-chat-b", status: "completed", stages: ["released"] });
    as("ar-chat-a");
    const body = (value: unknown) => new Request("https://findlyfy.test/x", { method: "POST", body: JSON.stringify(value) });
    const ctxOf = { params: Promise.resolve({ id: conversation.id }) };
    expect((await SEND(body({ text: "Привіт" }), ctxOf)).status).toBe(201);
    expect(await deleteAccount("ar-chat-b")).toEqual({ kind: "deleted" });
    const refused = await SEND(body({ text: "Ти тут?" }), ctxOf);
    expect(refused.status).toBe(409);
    expect((await DEAL(body({ title: "Логотип", stages: [{ title: "Е", amount: 500, days: 2 }] }), ctxOf)).status).toBe(409);
  });
});
