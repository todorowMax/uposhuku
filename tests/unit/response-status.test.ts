import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { GET as listMine } from "@/app/api/requests/route";
import { GET as listResponses } from "@/app/api/requests/[id]/responses/route";
import { PATCH as setStatus } from "@/app/api/requests/[id]/responses/[performerId]/route";
import { responses } from "@/db/schema";
import type { OfferResponse } from "@/lib/requests/types";
import { getDb } from "@/lib/server/db";
import { closeRequest, myResponses, saveResponse } from "@/lib/server/request-repo";
import { ctxOf, jsonRequest, openRequest, publishProfile } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
const patch = (id: string, performer: string, status: string) => setStatus(jsonRequest("PATCH", { status }), ctxOf({ id, performerId: `me-${performer}` }));
const statusOf = async (requestId: string, performer: string) =>
  (await getDb().select().from(responses).where(eq(responses.requestId, requestId))).find((row) => row.performerUserId === performer)?.status;
const offersOf = async (id: string) => ((await (await listResponses(new Request("https://findlyfy.test/x"), ctxOf({ id }))).json()) as { responses: OfferResponse[] }).responses;

let requestId = "";

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["rt-cust", "rt-stranger", "rt-perf1", "rt-perf2"]) await makeUser(ctx.db, id);
  for (const id of ["rt-perf1", "rt-perf2"]) await publishProfile(id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  as("rt-cust");
  requestId = (await openRequest("rt-cust")).id;
  await saveResponse("rt-perf1", requestId, { price: 1000, days: 3, message: "Зроблю" });
  await saveResponse("rt-perf2", requestId, { price: null, days: 5, message: "Теж зроблю" });
});

describe("статуси відгуків на сервері", () => {
  it("новий відгук має статус new; замовник бачить його в списку пропозицій", async () => {
    expect(await statusOf(requestId, "rt-perf1")).toBe("new");
    const offers = await offersOf(requestId);
    expect(offers.map((offer) => offer.status)).toEqual(["new", "new"]);
  });

  it("автор запиту ставить shortlisted, declined, chosen і повертає new; стан переживає перезавантаження (читається з бази)", async () => {
    for (const status of ["shortlisted", "declined", "chosen", "new"] as const) {
      expect((await patch(requestId, "rt-perf1", status)).status).toBe(200);
      expect(await statusOf(requestId, "rt-perf1")).toBe(status);
      expect((await offersOf(requestId)).find((offer) => offer.performerId === "me-rt-perf1")?.status).toBe(status);
    }
    // Другий відгук не зачеплено.
    expect(await statusOf(requestId, "rt-perf2")).toBe("new");
  });

  it("чужий запит: 404 і статус не змінюється; невідомий статус: 400; відгуку немає: 404; гість: 401", async () => {
    as("rt-stranger");
    expect((await patch(requestId, "rt-perf1", "declined")).status).toBe(404);
    expect(await statusOf(requestId, "rt-perf1")).toBe("new");
    as("rt-cust");
    expect((await patch(requestId, "rt-perf1", "banned")).status).toBe(400);
    expect((await patch(requestId, "rt-nobody", "declined")).status).toBe(404);
    as(null);
    expect((await patch(requestId, "rt-perf1", "declined")).status).toBe(401);
  });

  it("виконавець не може міняти статус свого відгуку на чужому запиті", async () => {
    as("rt-perf1");
    expect((await patch(requestId, "rt-perf1", "chosen")).status).toBe(404);
    expect(await statusOf(requestId, "rt-perf1")).toBe("new");
  });

  it("закритий запит рішень не приймає (409)", async () => {
    await closeRequest("rt-cust", requestId);
    expect((await patch(requestId, "rt-perf1", "declined")).status).toBe(409);
    expect(await statusOf(requestId, "rt-perf1")).toBe("new");
  });

  it("виконавець не бачить статусу: його відгук (myResponses) без поля status", async () => {
    await patch(requestId, "rt-perf1", "declined");
    const mine = (await myResponses("rt-perf1")).get(requestId);
    expect(mine).toBeDefined();
    expect(mine).not.toHaveProperty("status");
  });
});

describe("лічильники відгуків у /api/requests", () => {
  it("відповідь містить responseCounts для відкритих запитів і не ходить у /responses", async () => {
    const empty = (await openRequest("rt-cust")).id;
    const closed = (await openRequest("rt-cust")).id;
    await saveResponse("rt-perf1", closed, { price: null, days: 1, message: "ok" });
    await closeRequest("rt-cust", closed);
    const body = (await (await listMine()).json()) as { responseCounts: Record<string, number> };
    expect(body.responseCounts[requestId]).toBe(2);
    expect(body.responseCounts[empty] ?? 0).toBe(0);
    expect(closed in body.responseCounts).toBe(false);
  });

  it("чужі відгуки не потрапляють у лічильники іншого автора", async () => {
    as("rt-stranger");
    const body = (await (await listMine()).json()) as { responseCounts: Record<string, number> };
    expect(body.responseCounts).toEqual({});
  });
});
