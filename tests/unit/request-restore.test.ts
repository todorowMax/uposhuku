import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/notify-matching", () => ({ notifyMatchingPerformers: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { PATCH } from "@/app/api/requests/[id]/route";
import { messages, requests } from "@/db/schema";
import { RESTORE_WINDOW_MS, type PublishedRequest } from "@/lib/requests/types";
import { getDb } from "@/lib/server/db";
import { notifyMatchingPerformers } from "@/lib/server/notify-matching";
import { pushGlobal } from "@/lib/server/realtime";
import { closeRequest, createRequest, findRequest, listOthersOpen, reopenRequest } from "@/lib/server/request-repo";
import { exhaust, jsonRequest, openRequest, ctxOf } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
const send = (id: string, status: "open" | "closed") => PATCH(jsonRequest("PATCH", { status }), ctxOf({ id }));
const body = async (response: Response) => (await response.json()) as { request: PublishedRequest; detail?: string };
const closedAtOf = async (id: string) => (await getDb().select().from(requests).where(eq(requests.id, id)).limit(1))[0].closedAt;
const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["rs-cust", "rs-other"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  as("rs-cust");
  vi.mocked(pushGlobal).mockClear();
  vi.mocked(notifyMatchingPerformers).mockClear();
});

describe("відновлення закритого запиту", () => {
  it("закриття ставить closed_at і restoreUntil на добу вперед; відкритий запит restoreUntil не має", async () => {
    const own = await openRequest("rs-cust");
    expect(own.restoreUntil).toBeNull();
    const closedAt = Date.now();
    const closed = await closeRequest("rs-cust", own.id, closedAt);
    expect(closed?.status).toBe("closed");
    expect(await closedAtOf(own.id)).toBe(closedAt);
    expect(Date.parse(closed?.restoreUntil ?? "")).toBe(closedAt + RESTORE_WINDOW_MS);
  });

  it("у межах доби запит відновлюється: open, closed_at порожній, createdAt і дані ті самі, feed оновлено, без сповіщень", async () => {
    const created = await createRequest("rs-cust", { text: "Потрібен сайт для майстерні", budget: 3000, deadline: "week", cityId: "lviv", tags: [{ id: "website", label: "Сайт" }], files: [{ name: "a.pdf", size: 5, type: "" }] });
    await send(created.id, "closed");
    const messagesBefore = (await getDb().select().from(messages)).length;
    vi.mocked(pushGlobal).mockClear();
    const response = await send(created.id, "open");
    expect(response.status).toBe(200);
    const restored = (await body(response)).request;
    expect(restored).toEqual({ ...created, restoreUntil: null });
    expect(await closedAtOf(created.id)).toBeNull();
    expect(pushGlobal).toHaveBeenCalledWith({ t: "feed" });
    expect(notifyMatchingPerformers).not.toHaveBeenCalled();
    expect(await getDb().select().from(messages)).toHaveLength(messagesBefore);
    expect((await listOthersOpen("rs-other")).map((item) => item.id)).toContain(created.id);
  });

  it("після доби reopenRequest дає window_expired, route 409, запит лишається закритим і без restoreUntil", async () => {
    const own = await openRequest("rs-cust");
    const closedAt = Date.now() - RESTORE_WINDOW_MS - HOUR;
    await closeRequest("rs-cust", own.id, closedAt);
    expect(await reopenRequest("rs-cust", own.id, Date.now())).toBe("window_expired");
    const response = await send(own.id, "open");
    expect(response.status).toBe(409);
    expect((await body(response)).detail).toBe("Минуло понад добу: запит уже не відновити.");
    const stored = await findRequest("rs-cust", own.id);
    expect(stored).toMatchObject({ status: "closed", restoreUntil: null });
    expect(await closedAtOf(own.id)).toBe(closedAt);
  });

  it("межа вікна: за мить до кінця ще можна, рівно в кінець уже ні", async () => {
    const own = await openRequest("rs-cust");
    await closeRequest("rs-cust", own.id, 1_000_000);
    expect(await reopenRequest("rs-cust", own.id, 1_000_000 + RESTORE_WINDOW_MS)).toBe("window_expired");
    expect(await reopenRequest("rs-cust", own.id, 1_000_000 + RESTORE_WINDOW_MS - 1)).toMatchObject({ status: "open" });
  });

  it("закритий без closed_at (до цієї правки) не відновлюється", async () => {
    const own = await openRequest("rs-cust");
    await getDb().update(requests).set({ status: "closed" }).where(eq(requests.id, own.id));
    expect(await reopenRequest("rs-cust", own.id)).toBe("window_expired");
    expect((await findRequest("rs-cust", own.id))?.restoreUntil).toBeNull();
  });

  it("чужий запит: 404 і він лишається закритим", async () => {
    const own = await openRequest("rs-cust");
    await closeRequest("rs-cust", own.id);
    as("rs-other");
    expect((await send(own.id, "open")).status).toBe(404);
    expect((await findRequest("rs-cust", own.id))?.status).toBe("closed");
    expect((await send("req_nope", "open")).status).toBe(404);
  });

  it("відкритий запит «не відновлюється»: 404", async () => {
    const own = await openRequest("rs-cust");
    expect((await send(own.id, "open")).status).toBe(404);
    expect(await reopenRequest("rs-cust", own.id)).toBe("not_found");
  });

  it("повторне закриття не змінює closed_at, тож вікно не продовжується", async () => {
    const own = await openRequest("rs-cust");
    const first = Date.now() - 20 * HOUR;
    await closeRequest("rs-cust", own.id, first);
    await closeRequest("rs-cust", own.id, Date.now());
    expect(await closedAtOf(own.id)).toBe(first);
    expect(await reopenRequest("rs-cust", own.id, first + RESTORE_WINDOW_MS + 1)).toBe("window_expired");
  });

  it("після відновлення нове закриття дає нове вікно", async () => {
    const own = await openRequest("rs-cust");
    await closeRequest("rs-cust", own.id, 5_000);
    await reopenRequest("rs-cust", own.id, 6_000);
    await closeRequest("rs-cust", own.id, 9_000_000);
    expect(await closedAtOf(own.id)).toBe(9_000_000);
  });

  it("без входу 401, за ліміту правок 429", async () => {
    const own = await openRequest("rs-cust");
    await closeRequest("rs-cust", own.id);
    as(null);
    expect((await send(own.id, "open")).status).toBe(401);
    await makeUser(ctx.db, "rs-spam");
    as("rs-spam");
    await exhaust("requestEdit", "rs-spam");
    expect((await send(own.id, "open")).status).toBe(429);
  });
});
