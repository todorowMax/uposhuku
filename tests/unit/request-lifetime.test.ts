import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/notify-matching", () => ({ notifyMatchingPerformers: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { PATCH } from "@/app/api/requests/[id]/route";
import { requests } from "@/db/schema";
import { EXPIRED_RESTORE_WINDOW_MS, RENEW_AFTER_MS, RENEW_ANSWER_MS } from "@/lib/requests/lifetime";
import { RESTORE_WINDOW_MS } from "@/lib/requests/types";
import { getDb } from "@/lib/server/db";
import { notifyUser } from "@/lib/server/notify";
import { notifyMatchingPerformers } from "@/lib/server/notify-matching";
import { pushGlobal } from "@/lib/server/realtime";
import { askRenewals, expireUnanswered } from "@/lib/server/request-lifetime";
import { closeRequest, findRequest, reopenRequest } from "@/lib/server/request-repo";
import { renewNotice } from "@/lib/telegram/notices";
import { ctxOf, jsonRequest, openRequest } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1, 12, 0);
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
/** Запит, опублікований о T0 (рядок у базі підмінено, бо createRequest бере поточний час). */
const published = async (userId: string) => {
  const created = await openRequest(userId);
  await getDb().update(requests).set({ createdAt: T0, renewedAt: T0 }).where(eq(requests.id, created.id));
  return created.id;
};
const rowOf = async (id: string) => (await getDb().select().from(requests).where(eq(requests.id, id)).limit(1))[0];

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["lt-author", "lt-stranger"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  // Запити між тестами не переходять: кожен рахує лише свої.
  await getDb().delete(requests);
  as("lt-author");
  vi.mocked(notifyUser).mockClear();
  vi.mocked(pushGlobal).mockClear();
  vi.mocked(notifyMatchingPerformers).mockClear();
});

describe("строк життя запиту: питання «Ще актуально?»", () => {
  it("до 14 днів не питаємо; після 14 днів питаємо один раз, у ключі є одержувач", async () => {
    const id = await published("lt-author");
    expect(await askRenewals(T0 + RENEW_AFTER_MS - 1)).toBe(0);
    expect(notifyUser).not.toHaveBeenCalled();

    expect(await askRenewals(T0 + RENEW_AFTER_MS)).toBe(1);
    expect(await askRenewals(T0 + RENEW_AFTER_MS + 60_000)).toBe(0);
    expect(notifyUser).toHaveBeenCalledTimes(1);
    const [userId, notice] = vi.mocked(notifyUser).mock.calls[0];
    expect(userId).toBe("lt-author");
    expect(notice.key).toBe(`renew:${id}:lt-author:${T0}`);
    expect(notice.email?.type).toBe("renew");
    expect(notice.button?.path).toContain(encodeURIComponent(`renew:${id}`));
    expect((await rowOf(id)).renewalAskedAt).toBe(T0 + RENEW_AFTER_MS);
  });

  it("питання бачить автор: renewalDeadline на 3 дні від питання", async () => {
    const id = await published("lt-author");
    const asked = T0 + RENEW_AFTER_MS + 1000;
    await askRenewals(asked);
    const own = await findRequest("lt-author", id);
    expect(Date.parse(own?.renewalDeadline ?? "")).toBe(asked + RENEW_ANSWER_MS);
  });
});

describe("строк життя запиту: закриття без відповіді", () => {
  it("за 3 дні без відповіді запит закривається з причиною expired; раніше ні; питання без askRenewals не закриває", async () => {
    const id = await published("lt-author");
    expect(await expireUnanswered(T0 + 100 * DAY)).toBe(0);
    const asked = T0 + RENEW_AFTER_MS;
    await askRenewals(asked);
    expect(await expireUnanswered(asked + RENEW_ANSWER_MS - 1)).toBe(0);
    expect((await rowOf(id)).status).toBe("open");

    const closedAt = asked + RENEW_ANSWER_MS;
    expect(await expireUnanswered(closedAt)).toBe(1);
    const row = await rowOf(id);
    expect(row).toMatchObject({ status: "closed", closedAt, closeReason: "expired" });
    expect(await expireUnanswered(closedAt + 1000)).toBe(0);
  });

  it("протермінований запит відновлюється протягом 7 днів, а запит, закритий самим автором, лише протягом доби", async () => {
    const expired = await published("lt-author");
    const asked = T0 + RENEW_AFTER_MS;
    await askRenewals(asked);
    const closedAt = asked + RENEW_ANSWER_MS;
    await expireUnanswered(closedAt);
    const closed = await findRequest("lt-author", expired);
    expect(closed?.closeReason).toBe("expired");

    const own = await published("lt-author");
    await closeRequest("lt-author", own, closedAt);

    const day2 = closedAt + 2 * DAY;
    expect(await reopenRequest("lt-author", own, day2)).toBe("window_expired");
    expect(day2 - closedAt).toBeGreaterThan(RESTORE_WINDOW_MS);
    expect(await reopenRequest("lt-author", expired, closedAt + EXPIRED_RESTORE_WINDOW_MS + 1000)).toBe("window_expired");
    const reopened = await reopenRequest("lt-author", expired, closedAt + EXPIRED_RESTORE_WINDOW_MS - 1000);
    expect(reopened).toMatchObject({ status: "open", closeReason: null, renewalDeadline: null });
  });

  it("після відновлення строк життя йде заново: наступний tick запит не закриває й не питає", async () => {
    const id = await published("lt-author");
    const asked = T0 + RENEW_AFTER_MS;
    await askRenewals(asked);
    const closedAt = asked + RENEW_ANSWER_MS;
    await expireUnanswered(closedAt);
    const back = closedAt + DAY;
    await reopenRequest("lt-author", id, back);
    vi.mocked(notifyUser).mockClear();
    expect(await askRenewals(back + 5 * 60_000)).toBe(0);
    expect(await expireUnanswered(back + 5 * 60_000)).toBe(0);
    expect(notifyUser).not.toHaveBeenCalled();
    expect((await rowOf(id)).status).toBe("open");
  });
});

describe("«Так, ще актуально»", () => {
  const renew = (id: string) => PATCH(jsonRequest("PATCH", { renew: true }), ctxOf({ id }));

  it("скидає годинник: питання зникає, наступне через 14 днів від відповіді, а не від публікації; нікого не сповіщає", async () => {
    const id = await published("lt-author");
    await askRenewals(T0 + RENEW_AFTER_MS);
    vi.mocked(notifyUser).mockClear();
    const before = Date.now();
    const response = await renew(id);
    expect(response.status).toBe(200);
    const row = await rowOf(id);
    expect(row.renewalAskedAt).toBeNull();
    expect(row.renewedAt).toBeGreaterThanOrEqual(before);
    expect(row.status).toBe("open");
    // Ні виконавцям, ні стрічці: ні сповіщень, ні push, ні «запит під ваші теги».
    expect(notifyUser).not.toHaveBeenCalled();
    expect(notifyMatchingPerformers).not.toHaveBeenCalled();
    expect(pushGlobal).not.toHaveBeenCalled();

    const renewedAt = row.renewedAt as number;
    expect(await askRenewals(renewedAt + RENEW_AFTER_MS - 1000)).toBe(0);
    expect(await askRenewals(renewedAt + RENEW_AFTER_MS)).toBe(1);
  });

  it("чужий запит: 404 і нічого не змінюється; закритий: 409", async () => {
    const id = await published("lt-author");
    await askRenewals(T0 + RENEW_AFTER_MS);
    as("lt-stranger");
    expect((await renew(id)).status).toBe(404);
    expect((await rowOf(id)).renewalAskedAt).not.toBeNull();
    as("lt-author");
    await closeRequest("lt-author", id);
    expect((await renew(id)).status).toBe(409);
  });
});

describe("сповіщення «Ще актуально?»", () => {
  it("ключ містить одержувача, а новий строк дає новий ключ", () => {
    const first = renewNotice({ requestId: "req_1", userId: "u1", since: 1, title: "Сайт" });
    expect(first.key).toBe("renew:req_1:u1:1");
    expect(renewNotice({ requestId: "req_1", userId: "u2", since: 1, title: "Сайт" }).key).not.toBe(first.key);
    expect(renewNotice({ requestId: "req_1", userId: "u1", since: 2, title: "Сайт" }).key).not.toBe(first.key);
  });
});
