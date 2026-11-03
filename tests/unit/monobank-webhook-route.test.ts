import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const verify = vi.hoisted(() => vi.fn());
const announce = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monobank/webhook", () => ({ verifyWebhookSignature: verify }));
vi.mock("@/lib/server/placement-paid", () => ({ announcePlacementPaid: announce }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), serverEvent: vi.fn() }));

import { POST } from "@/app/api/monobank/webhook/route";
import { createPlacementInvoice } from "@/lib/server/placement-invoice-repo";
import { getPlacement } from "@/lib/server/placement-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;

beforeAll(async () => {
  ctx = await useTestD1();
  await makeUser(ctx.db, "hook-user");
  await createPlacementInvoice({ id: "pin_hook", userId: "hook-user", invoiceId: "inv-hook", amount: 100 }, 1_000);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  verify.mockReset();
  announce.mockReset();
});

const send = (body: unknown, sign: string | null = "sig") =>
  POST(new Request("https://findlyfy.test/api/monobank/webhook", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: sign ? { "x-sign": sign } : {} }));
const success = { invoiceId: "inv-hook", status: "success", amount: 10_000, modifiedDate: "2026-11-03T10:00:00Z" };

describe("POST /api/monobank/webhook", () => {
  it("невірний підпис: 401 без подробиць, оплата не зараховується", async () => {
    verify.mockResolvedValue(false);
    const response = await send(success);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("inv-hook");
    expect((await getPlacement("hook-user")).total).toBe(0);
  });

  it("немає заголовка X-Sign: 401, підпис навіть не перевіряється", async () => {
    expect((await send(success, null)).status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("вірний підпис: зараховує один раз і сповіщає один раз, повтор теж 200", async () => {
    verify.mockResolvedValue(true);
    expect((await send(success)).status).toBe(200);
    expect((await send(success)).status).toBe(200);
    expect((await getPlacement("hook-user")).total).toBe(100);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("hook-user", 100, "/api/monobank/webhook");
  });

  it("вірний підпис, але рахунок не наш або тіло зламане: 200, щоб банк не повторював", async () => {
    verify.mockResolvedValue(true);
    expect((await send({ ...success, invoiceId: "someone-else" })).status).toBe(200);
    expect((await send("not json")).status).toBe(200);
    expect(announce).not.toHaveBeenCalled();
  });
});
