import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/notify", () => ({ notifyLater: notify }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: vi.fn(), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import type { Deal } from "@/lib/deals/types";
import { actAsPerformer, actOnDeal, mutateDeal, proposeDeal } from "@/lib/server/deal-repo";
import { runPayReminders } from "@/lib/server/pay-reminders";
import { makeUser, useTestD1 } from "../helpers/d1";

const DAY = 86_400_000;
let ctx: Awaited<ReturnType<typeof useTestD1>>;
let counter = 0;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["pr-cust", "pr-perf"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => notify.mockReset());

/** Прийнята угода: прямий переказ, дві умови, виконавець pr-perf. */
const accepted = async (method: "direct" | "safe" = "direct"): Promise<Deal> => {
  counter += 1;
  const performer = { id: "me-pr-perf", name: "Юлія", avatarIndex: 0, specialty: "", fop: method === "safe" };
  const deal = await proposeDeal("pr-cust", { requestId: `pr-r${counter}`, responseId: `pr-x${counter}`, method, performer, stages: [{ title: "Макет", amount: 1000, days: 5 }, { title: "Верстка", amount: 1000, days: 5 }] }, { safeEnabled: true });
  if (typeof deal === "string") throw new Error(deal);
  const done = await actAsPerformer("pr-perf", deal.id, "accept", undefined);
  if (typeof done === "string" || !done) throw new Error(String(done));
  return done;
};
const sentTo = (userId: string, dealId: string) => notify.mock.calls.filter((call) => call[0] === userId && String((call[1] as { key: string }).key).includes(dealId)).map((call) => call[1] as { key: string; html: string });
const acceptedAtOf = (deal: Deal) => Date.parse(deal.acceptedAt!);

describe("runPayReminders", () => {
  it("тиждень без оплати: по одному нагадуванню замовнику й виконавцю зі своїм текстом, без повтору в тому ж запуску", async () => {
    const deal = await accepted();
    const at = acceptedAtOf(deal);
    expect((await runPayReminders(at + 6 * DAY)).deals).toBe(0);
    expect(sentTo("pr-cust", deal.id)).toHaveLength(0);

    await runPayReminders(at + 7 * DAY + 1000);
    const customer = sentTo("pr-cust", deal.id);
    const performer = sentTo("pr-perf", deal.id);
    expect(customer).toHaveLength(1);
    expect(performer).toHaveLength(1);
    expect(customer[0].html).toBe("Угода: Ви оплатили етап «Макет»? Позначте «Я оплатив(ла)» в угоді.");
    expect(performer[0].html).toBe("Угода: Оплата за етап «Макет» надійшла? Позначте «Оплату отримано».");

    await runPayReminders(at + 7 * DAY + 2000);
    await runPayReminders(at + 10 * DAY);
    expect(sentTo("pr-cust", deal.id)).toHaveLength(1);
  });

  it("повтор через 7 днів, потім стоп: рівно два нагадування на етап", async () => {
    const deal = await accepted();
    const at = acceptedAtOf(deal);
    await runPayReminders(at + 8 * DAY);
    await runPayReminders(at + 16 * DAY);
    await runPayReminders(at + 40 * DAY);
    await runPayReminders(at + 80 * DAY);
    const keys = sentTo("pr-cust", deal.id).map((item) => item.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(sentTo("pr-perf", deal.id)).toHaveLength(2);
  });

  it("етап, де замовник уже позначив оплату, теж нагадує (виконавець ще не підтвердив); підтверджений мовчить", async () => {
    const claimed = await accepted();
    await actOnDeal("pr-cust", claimed.id, "claim_paid", claimed.stages[0].id);
    const confirmed = await accepted();
    await actAsPerformer("pr-perf", confirmed.id, "confirm_paid", confirmed.stages[0].id);
    await runPayReminders(acceptedAtOf(claimed) + 8 * DAY);
    expect(sentTo("pr-cust", claimed.id)).toHaveLength(1);
    expect(sentTo("pr-cust", confirmed.id)).toHaveLength(0);
  });

  it("безпечна угода не нагадує, а другий етап чекає від завершення першого", async () => {
    const safe = await accepted("safe");
    const direct = await accepted();
    const at = acceptedAtOf(direct);
    await mutateDeal(direct.id, (current) => ({ ...current, stages: current.stages.map((stage, index) => (index === 0 ? { ...stage, status: "released" as const, releasedAt: new Date(at + 20 * DAY).toISOString() } : stage)) }));
    await runPayReminders(at + 26 * DAY);
    expect(sentTo("pr-cust", safe.id)).toHaveLength(0);
    expect(sentTo("pr-cust", direct.id)).toHaveLength(0);
    await runPayReminders(at + 28 * DAY);
    expect(sentTo("pr-cust", direct.id)).toHaveLength(1);
    expect(sentTo("pr-cust", direct.id)[0].html).toContain("«Верстка»");
  });
});
