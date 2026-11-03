import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InvoiceStatusResponse } from "@/lib/monobank/client";
import { applyInvoiceStatus, createPlacementInvoice, getPlacementInvoice } from "@/lib/server/placement-invoice-repo";
import { getPlacement } from "@/lib/server/placement-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["pi-a", "pi-b", "pi-c", "pi-d", "pi-e", "pi-r", "pi-owner", "pi-other"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});

const status = (invoiceId: string, state: InvoiceStatusResponse["status"], modifiedDate: string): InvoiceStatusResponse => ({ invoiceId, status: state, amount: 10_000, modifiedDate });
const open = (id: string, userId: string, invoiceId: string) => createPlacementInvoice({ id, userId, invoiceId, amount: 100 }, 1_000);

describe("рахунки за розміщення", () => {
  it("success зараховує оплату один раз, повтор і новіша копія success нічого не додають", async () => {
    await open("pin_a", "pi-a", "inv-a");
    expect(await applyInvoiceStatus(status("inv-a", "success", "2026-11-03T10:00:00Z"), 2_000)).toEqual({ credited: true, userId: "pi-a", amount: 100 });
    expect(await applyInvoiceStatus(status("inv-a", "success", "2026-11-03T10:00:00Z"), 2_100)).toMatchObject({ credited: false });
    expect(await applyInvoiceStatus(status("inv-a", "success", "2026-11-03T10:00:05Z"), 2_200)).toMatchObject({ credited: false });
    const placement = await getPlacement("pi-a");
    expect(placement.total).toBe(100);
    expect(placement.payments).toHaveLength(1);
    expect(placement.payments[0].id).toBe("pay_mono_inv-a");
    expect(placement.tier).toBeGreaterThanOrEqual(2);
  });

  it("подія зі старою датою не відкочує статус", async () => {
    await open("pin_b", "pi-b", "inv-b");
    await applyInvoiceStatus(status("inv-b", "processing", "2026-11-03T10:00:10Z"), 2_000);
    await applyInvoiceStatus(status("inv-b", "created", "2026-11-03T10:00:00Z"), 2_100);
    expect((await getPlacementInvoice("pin_b", "pi-b"))?.status).toBe("processing");
    // Запізнілий success зі старою датою теж не рахується: його вже обігнала новіша подія.
    expect(await applyInvoiceStatus(status("inv-b", "success", "2026-11-03T10:00:05Z"), 2_200)).toMatchObject({ credited: false });
    expect((await getPlacement("pi-b")).total).toBe(0);
  });

  it("failure і expired оплату не зараховують, а статус зберігають", async () => {
    await open("pin_c", "pi-c", "inv-c");
    expect(await applyInvoiceStatus(status("inv-c", "failure", "2026-11-03T10:00:00Z"), 2_000)).toMatchObject({ credited: false, userId: "pi-c" });
    expect((await getPlacementInvoice("pin_c", "pi-c"))?.status).toBe("failure");
    expect((await getPlacement("pi-c")).payments).toHaveLength(0);
  });

  it("чужий рахунок (безпечна угода) дає null й нічого не чіпає", async () => {
    expect(await applyInvoiceStatus(status("inv-unknown", "success", "2026-11-03T10:00:00Z"), 2_000)).toBeNull();
  });

  it("сума банку, що не збігається з нашою, не зараховується", async () => {
    await open("pin_d", "pi-d", "inv-d");
    expect(await applyInvoiceStatus({ ...status("inv-d", "success", "2026-11-03T10:00:00Z"), amount: 5_000 }, 2_000)).toMatchObject({ credited: false });
    expect((await getPlacement("pi-d")).total).toBe(0);
  });

  it("повернення (reversed) знімає зараховану оплату", async () => {
    await open("pin_r", "pi-r", "inv-r");
    await applyInvoiceStatus(status("inv-r", "success", "2026-11-03T10:00:00Z"), 2_000);
    expect((await getPlacement("pi-r")).total).toBe(100);
    expect(await applyInvoiceStatus(status("inv-r", "reversed", "2026-11-04T10:00:00Z"), 3_000)).toMatchObject({ credited: false });
    expect((await getPlacement("pi-r")).total).toBe(0);
    expect((await getPlacementInvoice("pin_r", "pi-r"))?.status).toBe("reversed");
  });

  it("рахунок бачить лише власник", async () => {
    await open("pin_e", "pi-owner", "inv-e");
    expect(await getPlacementInvoice("pin_e", "pi-owner")).toMatchObject({ status: "created", amount: 100 });
    expect(await getPlacementInvoice("pin_e", "pi-other")).toBeNull();
  });

  it("один рахунок банку записується лише раз", async () => {
    await open("pin_f", "pi-e", "inv-f");
    await expect(open("pin_g", "pi-e", "inv-f")).rejects.toThrow();
  });
});
