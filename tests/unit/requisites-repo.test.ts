import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { dealRequisites, payoutRequisites, requisiteReads } from "@/db/schema";
import type { DealDraft } from "@/lib/deals/types";
import { actAsPerformer, actOnDeal, proposeDeal, proposeDirectDeal } from "@/lib/server/deal-repo";
import { getDb } from "@/lib/server/db";
import { getOwnRequisites, readDealRequisites, REQUISITES_DELAY_MS, saveOwnRequisites, snapshotDealRequisites } from "@/lib/server/requisites-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;

beforeAll(async () => {
  process.env.REQUISITES_KEY = Buffer.alloc(32, 9).toString("base64");
  ctx = await useTestD1();
  for (const id of ["rq-cust", "rq-perf", "rq-other", "rq-perf2"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});

const IBAN_A = "UA213223130000026007233566001";
const IBAN_B = "UA903052992990004149123456789";
const value = (iban: string) => ({ recipient: "ФОП Іваненко І. І.", iban, taxCode: "1234567890" });
const T0 = 1_800_000_000_000;

const draft = (performerUser: string): DealDraft => ({
  requestId: "r1",
  responseId: `resp-${performerUser}`,
  method: "direct",
  performer: { id: `me-${performerUser}`, name: "Виконавець", avatarIndex: 0, specialty: "", fop: false },
  stages: [{ title: "Робота", amount: 1000, days: 3 }],
});

const openDeal = async (performerUser: string, now: number) => {
  const deal = await proposeDeal("rq-cust", draft(performerUser), now);
  if (typeof deal === "string") throw new Error(deal);
  return deal;
};

describe("реквізити виконавця", () => {
  it("перше збереження діє одразу, зберігається шифротекстом з маскою", async () => {
    expect(await getOwnRequisites("rq-perf", T0)).toEqual({ requisites: null, mask: null, pending: null });
    expect(await saveOwnRequisites("rq-perf", value(IBAN_A), T0)).toEqual({ kind: "saved" });
    const own = await getOwnRequisites("rq-perf", T0);
    expect(own.requisites?.iban).toBe(IBAN_A);
    expect(own.pending).toBeNull();
    const [row] = await getDb().select().from(payoutRequisites).where(eq(payoutRequisites.userId, "rq-perf"));
    expect(row.cipher).not.toContain(IBAN_A);
    expect(row.mask).toContain("UA21");
    expect(row.mask).not.toContain("3223130000026007");
  });

  it("зміна чекає 24 години: до того діють старі, потім нові", async () => {
    const outcome = await saveOwnRequisites("rq-perf", value(IBAN_B), T0 + 1000);
    expect(outcome).toEqual({ kind: "pending", effectiveAt: T0 + 1000 + REQUISITES_DELAY_MS });
    const before = await getOwnRequisites("rq-perf", T0 + REQUISITES_DELAY_MS);
    expect(before.requisites?.iban).toBe(IBAN_A);
    expect(before.pending?.requisites.iban).toBe(IBAN_B);
    const after = await getOwnRequisites("rq-perf", T0 + 1000 + REQUISITES_DELAY_MS);
    expect(after.requisites?.iban).toBe(IBAN_B);
    expect(after.pending).toBeNull();
  });
});

describe("знімок у угоді", () => {
  it("береться при прийнятті й не змінюється після зміни реквізитів", async () => {
    await saveOwnRequisites("rq-perf2", value(IBAN_A), T0);
    const deal = await openDeal("rq-perf2", T0);
    expect(await readDealRequisites(deal.id, "rq-cust", T0)).toBeNull(); // ще не прийнята
    const accepted = await actAsPerformer("rq-perf2", deal.id, "accept", undefined, T0 + 10);
    expect(typeof accepted).toBe("object");
    const [snap] = await getDb().select().from(dealRequisites).where(eq(dealRequisites.dealId, deal.id));
    expect(snap).toBeTruthy();

    // Виконавець міняє реквізити, чекає добу: поточні вже нові, а в угоді старі.
    await saveOwnRequisites("rq-perf2", value(IBAN_B), T0 + 20);
    const later = T0 + 20 + REQUISITES_DELAY_MS + 1;
    expect((await getOwnRequisites("rq-perf2", later)).requisites?.iban).toBe(IBAN_B);
    expect((await readDealRequisites(deal.id, "rq-cust", later))?.requisites?.iban).toBe(IBAN_A);
    expect((await readDealRequisites(deal.id, "rq-perf2", later))?.requisites?.iban).toBe(IBAN_A);
  });

  it("чужий отримує null (404), читання замовником лишає запис у журналі, виконавцем ні", async () => {
    await saveOwnRequisites("rq-perf", value(IBAN_A), T0 - 10).catch(() => undefined);
    const deal = await openDeal("rq-perf", T0 + 50);
    await actAsPerformer("rq-perf", deal.id, "accept", undefined, T0 + 60);
    expect(await readDealRequisites(deal.id, "rq-other", T0 + 70)).toBeNull();
    expect(await readDealRequisites("deal_nope", "rq-cust", T0 + 70)).toBeNull();
    const before = (await getDb().select().from(requisiteReads).where(eq(requisiteReads.dealId, deal.id))).length;
    expect((await readDealRequisites(deal.id, "rq-cust", T0 + 80))?.requisites).toBeTruthy();
    expect((await readDealRequisites(deal.id, "rq-perf", T0 + 90))?.requisites).toBeTruthy();
    const reads = await getDb().select().from(requisiteReads).where(eq(requisiteReads.dealId, deal.id));
    expect(reads.length - before).toBe(1);
    expect(reads.at(-1)?.readerUserId).toBe("rq-cust");
  });

  it("якщо реквізитів при прийнятті не було, знімок береться при першому читанні після їх появи", async () => {
    await makeUser(ctx.db, "rq-late");
    const deal = await openDeal("rq-late", T0 + 100);
    await actAsPerformer("rq-late", deal.id, "accept", undefined, T0 + 110);
    expect(await readDealRequisites(deal.id, "rq-cust", T0 + 120)).toEqual({ requisites: null, mask: null });
    await saveOwnRequisites("rq-late", value(IBAN_A), T0 + 130);
    expect((await readDealRequisites(deal.id, "rq-cust", T0 + 140))?.requisites?.iban).toBe(IBAN_A);
    // Далі знімок вже заморожений.
    await saveOwnRequisites("rq-late", value(IBAN_B), T0 + 150);
    expect((await readDealRequisites(deal.id, "rq-cust", T0 + 160 + REQUISITES_DELAY_MS))?.requisites?.iban).toBe(IBAN_A);
    expect(await snapshotDealRequisites(deal.id, "rq-late", T0 + 170)).toBe(true);
  });

  it("не прямий переказ або не прийнята угода: null", async () => {
    await makeUser(ctx.db, "rq-pending");
    await saveOwnRequisites("rq-pending", value(IBAN_A), T0);
    const deal = await openDeal("rq-pending", T0 + 200);
    expect(await readDealRequisites(deal.id, "rq-pending", T0 + 210)).toBeNull();
  });

  it("прийняття замовником пропозиції виконавця теж знімає знімок", async () => {
    await makeUser(ctx.db, "rq-prop");
    await saveOwnRequisites("rq-prop", value(IBAN_B), T0);
    const conversation = { id: "conv-rq", customerUserId: "rq-cust", performerId: "me-rq-prop" };
    const deal = await proposeDirectDeal(conversation, "performer", { title: "Логотип", method: "direct", performer: { id: "me-rq-prop", name: "П", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] }, T0 + 300);
    expect(typeof deal).toBe("object");
    const id = (deal as { id: string }).id;
    expect(typeof (await actOnDeal("rq-cust", id, "accept", undefined, T0 + 310))).toBe("object");
    const [snap] = await getDb().select().from(dealRequisites).where(eq(dealRequisites.dealId, id));
    expect(snap).toBeTruthy();
  });

  it("угода із самим собою відхиляється в обох шляхах", async () => {
    const own = await proposeDeal("rq-cust", draft("rq-cust"), T0);
    expect(own).toMatch(/З собою/);
    const direct = await proposeDirectDeal({ id: "c-self", customerUserId: "rq-cust", performerId: "me-rq-cust" }, "customer", { title: "Тест", method: "direct", performer: { id: "me-rq-cust", name: "Я", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] }, T0);
    expect(direct).toMatch(/З собою/);
  });
});
