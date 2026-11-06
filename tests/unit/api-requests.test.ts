import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/notify-matching", () => ({ notifyMatchingPerformers: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { GET as LIST_RESPONSES } from "@/app/api/requests/[id]/responses/route";
import { PATCH } from "@/app/api/requests/[id]/route";
import { GET, POST } from "@/app/api/requests/route";
import { DELETE as WITHDRAW, PUT as RESPOND } from "@/app/api/feed/[id]/response/route";
import { requests, responses } from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { findRequest, responsesTo } from "@/lib/server/request-repo";
import { ctxOf, exhaust, jsonRequest, openRequest, publishProfile } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
const OFFER = { price: 1500, days: 5, message: "Зроблю за тиждень, почну завтра." };
const text = async (response: Response) => (await response.json()) as Record<string, unknown>;

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["ar-cust", "ar-other", "ar-perf", "ar-perf2", "ar-draft"]) await makeUser(ctx.db, id);
  await publishProfile("ar-perf");
  await publishProfile("ar-perf2");
  await publishProfile("ar-draft", { published: false });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => as("ar-cust"));

describe("POST/GET /api/requests", () => {
  it("без входу 401", async () => {
    as(null);
    expect((await POST(jsonRequest("POST", { text: "Потрібен сайт" }))).status).toBe(401);
    expect((await GET()).status).toBe(401);
  });

  it("зламане тіло, порожній і закороткий опис дають 400 і нічого не зберігають", async () => {
    as("ar-bad-body");
    await makeUser(ctx.db, "ar-bad-body");
    for (const body of ["{not json", "[]", {}, { text: "" }, { text: "ab" }, { text: 42 }, { text: "а".repeat(4001) }]) {
      expect((await POST(jsonRequest("POST", body))).status, JSON.stringify(body)).toBe(400);
    }
    expect(await getDb().select().from(requests).where(eq(requests.userId, "ar-bad-body"))).toHaveLength(0);
  });

  it("публікує від імені сесії, а не від userId з тіла; ціна поза межами відкидається", async () => {
    const response = await POST(jsonRequest("POST", { text: "Потрібен Telegram-бот", userId: "ar-other", budget: 5 }));
    expect(response.status).toBe(201);
    const created = ((await text(response)).request as { id: string; budget: number | null });
    expect(created.budget).toBeNull();
    const [row] = await getDb().select().from(requests).where(eq(requests.id, created.id));
    expect(row.userId).toBe("ar-cust");
  });

  it("список лише власних запитів", async () => {
    await openRequest("ar-other", "Чужий запит про логотип");
    const mine = (await text(await GET())).requests as { text: string }[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.map((item) => item.text)).not.toContain("Чужий запит про логотип");
  });

  it("11-й запит за годину дає 429", async () => {
    as("ar-spammer");
    await makeUser(ctx.db, "ar-spammer");
    await exhaust("requestCreate", "ar-spammer");
    const response = await POST(jsonRequest("POST", { text: "Ще один запит" }));
    expect(response.status).toBe(429);
    expect((await text(response)).type).toBe("/problems/rate-limited");
    expect(await getDb().select().from(requests).where(eq(requests.userId, "ar-spammer"))).toHaveLength(0);
  });
});

describe("PATCH /api/requests/:id", () => {
  it("без входу 401", async () => {
    const own = await openRequest("ar-cust");
    as(null);
    expect((await PATCH(jsonRequest("PATCH", { status: "closed" }), ctxOf({ id: own.id }))).status).toBe(401);
    expect((await findRequest("ar-cust", own.id))?.status).toBe("open");
  });

  it("чужий і неіснуючий запит 404, чужий лишається відкритим", async () => {
    const foreign = await openRequest("ar-other");
    expect((await PATCH(jsonRequest("PATCH", { status: "closed" }), ctxOf({ id: foreign.id }))).status).toBe(404);
    expect((await PATCH(jsonRequest("PATCH", { status: "closed" }), ctxOf({ id: "req_nope" }))).status).toBe(404);
    expect((await findRequest("ar-other", foreign.id))?.status).toBe("open");
  });

  it("лише status: closed; будь-що інше 400, редагувати текст чи власника через PATCH не можна", async () => {
    const own = await openRequest("ar-cust", "Початковий опис запиту");
    for (const body of ["{bad", {}, { status: "open" }, { status: "deleted" }, { text: "Підмінений текст", userId: "ar-other" }]) {
      expect((await PATCH(jsonRequest("PATCH", body), ctxOf({ id: own.id }))).status, JSON.stringify(body)).toBe(400);
    }
    const after = await findRequest("ar-cust", own.id);
    expect(after?.text).toBe("Початковий опис запиту");
    expect(after?.status).toBe("open");
  });

  it("свій запит закривається, і відгукнутися на нього вже не можна", async () => {
    const own = await openRequest("ar-cust");
    const response = await PATCH(jsonRequest("PATCH", { status: "closed" }), ctxOf({ id: own.id }));
    expect(response.status).toBe(200);
    expect((await findRequest("ar-cust", own.id))?.status).toBe("closed");
    as("ar-perf");
    expect((await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: own.id }))).status).toBe(404);
  });
});

describe("GET /api/requests/:id/responses", () => {
  it("відгуки бачить лише власник запиту: гість 401, чужий і виконавець 404", async () => {
    const own = await openRequest("ar-cust");
    as("ar-perf");
    await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: own.id }));
    as("ar-cust");
    const list = (await text(await LIST_RESPONSES(new Request("https://findlyfy.test/x"), ctxOf({ id: own.id })))).responses as unknown[];
    expect(list).toHaveLength(1);
    as("ar-other");
    expect((await LIST_RESPONSES(new Request("https://findlyfy.test/x"), ctxOf({ id: own.id }))).status).toBe(404);
    as("ar-perf");
    expect((await LIST_RESPONSES(new Request("https://findlyfy.test/x"), ctxOf({ id: own.id }))).status).toBe(404);
    as(null);
    expect((await LIST_RESPONSES(new Request("https://findlyfy.test/x"), ctxOf({ id: own.id }))).status).toBe(401);
  });
});

describe("PUT/DELETE /api/feed/:id/response", () => {
  it("без входу 401", async () => {
    const target = await openRequest("ar-cust");
    as(null);
    expect((await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: target.id }))).status).toBe(401);
    expect((await WITHDRAW(new Request("https://findlyfy.test/x", { method: "DELETE" }), ctxOf({ id: target.id }))).status).toBe(401);
  });

  it("без опублікованого профілю виконавця 403, відгук не зберігається", async () => {
    const target = await openRequest("ar-cust");
    for (const id of ["ar-draft", "ar-other"]) {
      as(id);
      expect((await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: target.id }))).status).toBe(403);
    }
    expect(await responsesTo(target.id)).toHaveLength(0);
  });

  it("на власний запит 404, на закритий і неіснуючий теж", async () => {
    await publishProfile("ar-cust", { name: "Замовник-виконавець" });
    const own = await openRequest("ar-cust");
    as("ar-cust");
    expect((await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: own.id }))).status).toBe(404);
    expect(await responsesTo(own.id)).toHaveLength(0);
    as("ar-perf");
    expect((await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: "req_nope" }))).status).toBe(404);
  });

  it("поганий відгук 400: ціна, термін, короткий текст, зламане тіло", async () => {
    const target = await openRequest("ar-cust");
    as("ar-perf");
    for (const body of ["{bad", {}, { ...OFFER, price: -5 }, { ...OFFER, price: "1500" }, { ...OFFER, days: 0 }, { ...OFFER, days: "5" }, { ...OFFER, message: "коротко" }]) {
      expect((await RESPOND(jsonRequest("PUT", body), ctxOf({ id: target.id }))).status, JSON.stringify(body)).toBe(400);
    }
    expect(await responsesTo(target.id)).toHaveLength(0);
  });

  it("свій відгук зберігається, повторний PUT оновлює той самий, а не додає другий", async () => {
    const target = await openRequest("ar-cust");
    as("ar-perf");
    expect((await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: target.id }))).status).toBe(200);
    expect((await RESPOND(jsonRequest("PUT", { ...OFFER, price: 2000 }), ctxOf({ id: target.id }))).status).toBe(200);
    const rows = await responsesTo(target.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].response.price).toBe(2000);
  });

  it("DELETE знімає лише свій відгук: чужий лишається", async () => {
    const target = await openRequest("ar-cust");
    as("ar-perf");
    await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: target.id }));
    as("ar-perf2");
    await RESPOND(jsonRequest("PUT", { ...OFFER, price: 900 }), ctxOf({ id: target.id }));
    expect((await WITHDRAW(new Request("https://findlyfy.test/x", { method: "DELETE" }), ctxOf({ id: target.id }))).status).toBe(204);
    const left = await getDb().select().from(responses).where(eq(responses.requestId, target.id));
    expect(left.map((row) => row.performerUserId)).toEqual(["ar-perf"]);
  });

  it("виконавець без власного відгуку не може зняти чужий", async () => {
    const target = await openRequest("ar-cust");
    as("ar-perf");
    await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: target.id }));
    as("ar-perf2");
    await WITHDRAW(new Request("https://findlyfy.test/x", { method: "DELETE" }), ctxOf({ id: target.id }));
    expect(await responsesTo(target.id)).toHaveLength(1);
  });

  it("31-й відгук за годину дає 429", async () => {
    const target = await openRequest("ar-cust");
    as("ar-perf");
    await exhaust("responseCreate", "ar-perf");
    const response = await RESPOND(jsonRequest("PUT", OFFER), ctxOf({ id: target.id }));
    expect(response.status).toBe(429);
    expect(await responsesTo(target.id)).toHaveLength(0);
  });
});
