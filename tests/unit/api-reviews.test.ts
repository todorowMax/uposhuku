import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { GET, POST } from "@/app/api/reviews/route";
import { reviews } from "@/db/schema";
import type { Deal } from "@/lib/deals/types";
import { getDb } from "@/lib/server/db";
import { saveProof } from "@/lib/server/crypto-proof-repo";
import { listDeals, mutateDeal, proposeDeal } from "@/lib/server/deal-repo";
import { exhaust, jsonRequest } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let counter = 0;
const as = (id: string | null, name: string | null = null) => {
  session.user = id ? { id, email: `${id}@example.com`, name } : null;
};
const body = async (response: Response) => (await response.json()) as Record<string, unknown>;
const GOOD = { stars: 5, text: "Все зробили вчасно" };
const rowsFor = async (dealId: string) => getDb().select().from(reviews).where(eq(reviews.dealId, dealId));

/** Угода замовника з виконавцем; completed ставимо прямо, шлях до завершення перевіряють тести угод. */
const makeDeal = async (customer: string, performerUser: string, status: Deal["status"]) => {
  counter++;
  const deal = await proposeDeal(customer, { requestId: `rv-r${counter}`, responseId: `rv-x${counter}`, method: "direct", performer: { id: `me-${performerUser}`, name: "Виконавець", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] }, { safeEnabled: true });
  if (typeof deal === "string") throw new Error(deal);
  if (status !== deal.status) await mutateDeal(deal.id, (current) => ({ ...current, status }));
  return deal.id;
};

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["rv-cust", "rv-perf", "rv-other", "rv-spam", "rv-bad", "rv-ver"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => as("rv-cust"));

describe("POST /api/reviews", () => {
  it("без входу 401", async () => {
    as(null);
    expect((await POST(jsonRequest("POST", { dealId: "x", ...GOOD }))).status).toBe(401);
  });

  it("відгук по своїй завершеній угоді створюється, автор підписаний без пошти", async () => {
    const dealId = await makeDeal("rv-cust", "rv-perf", "completed");
    const response = await POST(jsonRequest("POST", { dealId, ...GOOD }));
    expect(response.status).toBe(201);
    const review = (await body(response)).review as { author: string; performerId: string };
    expect(review.author).toBe("Замовник");
    expect(review.performerId).toBe("me-rv-perf");
    expect(JSON.stringify(review)).not.toContain("rv-cust@example.com");
    expect(await rowsFor(dealId)).toHaveLength(1);
  });

  it("підписується іменем з профілю, але не повним імʼям і не поштою", async () => {
    const dealId = await makeDeal("rv-cust", "rv-perf", "completed");
    as("rv-cust", "Олена Коваль");
    const review = (await body(await POST(jsonRequest("POST", { dealId, ...GOOD })))).review as { author: string };
    expect(review.author).toBe("Олена");
  });

  it("чужа угода 404: інший замовник, сам виконавець і вигаданий id не лишають відгук", async () => {
    const dealId = await makeDeal("rv-cust", "rv-perf", "completed");
    for (const id of ["rv-other", "rv-perf"]) {
      as(id);
      expect((await POST(jsonRequest("POST", { dealId, ...GOOD }))).status, id).toBe(404);
    }
    as("rv-other");
    expect((await POST(jsonRequest("POST", { dealId: "deal_nope", ...GOOD }))).status).toBe(404);
    expect(await rowsFor(dealId)).toHaveLength(0);
  });

  it("незавершена угода 409, відгуку нема", async () => {
    for (const status of ["proposed", "accepted"] as const) {
      const dealId = await makeDeal("rv-cust", "rv-perf", status);
      expect((await POST(jsonRequest("POST", { dealId, ...GOOD }))).status, status).toBe(409);
      expect(await rowsFor(dealId)).toHaveLength(0);
    }
  });

  it("один відгук на угоду: другий 409, і перший лишається", async () => {
    const dealId = await makeDeal("rv-cust", "rv-perf", "completed");
    expect((await POST(jsonRequest("POST", { dealId, stars: 4, text: "Перший" }))).status).toBe(201);
    expect((await POST(jsonRequest("POST", { dealId, stars: 1, text: "Другий" }))).status).toBe(409);
    const rows = await rowsFor(dealId);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("Перший");
  });

  it("два одночасні запити на одну угоду дають один відгук", async () => {
    const dealId = await makeDeal("rv-cust", "rv-perf", "completed");
    const results = await Promise.allSettled([POST(jsonRequest("POST", { dealId, ...GOOD })), POST(jsonRequest("POST", { dealId, ...GOOD }))]);
    const statuses = results.map((result) => (result.status === "fulfilled" ? result.value.status : 500));
    expect(statuses.sort()).toEqual([201, 409]);
    expect(await rowsFor(dealId)).toHaveLength(1);
  });

  it("зламане тіло, без dealId, оцінка поза 1..5 і нечислова: 404 або 400, відгуку нема", async () => {
    // Свій користувач: ліміт відгуків (10 за годину) рахується на кожне звернення, і в цього тесту їх багато.
    as("rv-bad");
    const dealId = await makeDeal("rv-bad", "rv-perf", "completed");
    expect((await POST(jsonRequest("POST", "{bad"))).status).toBe(404);
    expect((await POST(jsonRequest("POST", {}))).status).toBe(404);
    for (const stars of [0, 6, -1, "5", null]) {
      expect((await POST(jsonRequest("POST", { dealId, stars, text: "x" }))).status, String(stars)).toBe(400);
    }
    expect(await rowsFor(dealId)).toHaveLength(0);
  });

  it("11-й відгук за годину дає 429", async () => {
    as("rv-spam");
    const dealId = await makeDeal("rv-spam", "rv-perf", "completed");
    await exhaust("reviewCreate", "rv-spam");
    expect((await POST(jsonRequest("POST", { dealId, ...GOOD }))).status).toBe(429);
    expect(await rowsFor(dealId)).toHaveLength(0);
  });
});

describe("позначка «Перевірена угода»", () => {
  /** Завершена прямa угода з етапом, оплаченим вказаним способом. */
  const paidDeal = async (paidVia: "usdt" | "bank", withProof: boolean) => {
    const dealId = await makeDeal("rv-ver", "rv-perf", "accepted");
    await mutateDeal(dealId, (current) => ({ ...current, status: "completed", stages: current.stages.map((stage) => ({ ...stage, status: "released", paidVia })) }));
    if (withProof) {
      const stageId = (await getDealStageId(dealId))!;
      await saveProof({ dealId, stageId, txHash: `${"ab".repeat(31)}${String(counter).padStart(2, "0")}`, proof: { from: "T1", to: "T2", amountUnits: "500000000", confirmations: 20, blockTime: 1 } });
    }
    return dealId;
  };
  const getDealStageId = async (dealId: string) => (await listDeals("rv-ver")).find((deal) => deal.id === dealId)?.stages[0]?.id;
  const verifiedOf = async (dealId: string) => (await rowsFor(dealId))[0]?.verified;

  it("підробка verified у тілі не діє: прямий етап без підтвердження дає 0", async () => {
    as("rv-ver");
    const dealId = await paidDeal("bank", false);
    const response = await POST(jsonRequest("POST", { dealId, ...GOOD, verified: true }));
    expect(response.status).toBe(201);
    expect(((await body(response)).review as { verified: boolean }).verified).toBe(false);
    expect(await verifiedOf(dealId)).toBe(0);
  });

  it("прямий переказ на банк із чужим записом підтвердження теж без позначки", async () => {
    as("rv-ver");
    const dealId = await paidDeal("bank", true);
    expect((await POST(jsonRequest("POST", { dealId, ...GOOD }))).status).toBe(201);
    expect(await verifiedOf(dealId)).toBe(0);
  });

  it("USDT із підтвердженням блокчейна дає позначку, GET її віддає", async () => {
    as("rv-ver");
    const dealId = await paidDeal("usdt", true);
    const response = await POST(jsonRequest("POST", { dealId, ...GOOD }));
    expect(((await body(response)).review as { verified: boolean }).verified).toBe(true);
    expect(await verifiedOf(dealId)).toBe(1);
    const list = await GET(new Request("https://findlyfy.test/api/reviews?performerId=me-rv-perf"));
    expect(((await body(list)).reviews as { dealId: string; verified: boolean }[]).find((item) => item.dealId === dealId)?.verified).toBe(true);
  });
});

describe("GET /api/reviews", () => {
  it("відгуки виконавця відкриті всім, без performerId 400", async () => {
    as(null);
    const response = await GET(new Request("https://findlyfy.test/api/reviews?performerId=me-rv-perf"));
    expect(response.status).toBe(200);
    expect(((await body(response)).reviews as unknown[]).length).toBeGreaterThan(0);
    expect((await GET(new Request("https://findlyfy.test/api/reviews"))).status).toBe(400);
  });

  it("відгук по угоді без входу 401", async () => {
    as(null);
    expect((await GET(new Request("https://findlyfy.test/api/reviews?dealId=deal_x"))).status).toBe(401);
  });
});
