import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => session.user }));

import { GET as CONFIG } from "@/app/api/deals/config/route";
import { initialMethod } from "@/lib/deals/machine";
import { performerIdOf } from "@/lib/deals/parties";
import { savePayoutAccount } from "@/lib/server/payment-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

// Безпечна угода в формі залежить від пари: режим для замовника й підключені виплати виконавця.

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  await makeUser(ctx.db, "pair-c");
  await makeUser(ctx.db, "pair-fop");
  await makeUser(ctx.db, "pair-plain");
  await savePayoutAccount({ userId: "pair-fop", provider: "monobank", taxId: "1234567890", receiverId: "recv-pair", status: "active" });
  session.user = { id: "pair-c", email: "pair-c@example.com" };
});
afterAll(async () => {
  delete process.env.SAFE_DEAL_MODE;
  await ctx.close();
});

const config = async (performer?: string): Promise<Record<string, unknown>> => (await CONFIG(new Request(`http://localhost/api/deals/config${performer ? `?performer=${encodeURIComponent(performer)}` : ""}`))).json();

describe("спосіб оплати за замовчуванням", () => {
  it("безпечна угода лише там, де вона доступна людині й виконавець підключив виплати", () => {
    expect(initialMethod(true, true)).toBe("safe");
    expect(initialMethod(true, false)).toBe("direct");
    expect(initialMethod(false, true)).toBe("direct");
    expect(initialMethod(false, false)).toBe("direct");
  });
});

describe("GET /api/deals/config з виконавцем", () => {
  it("каже, чи підключив виконавець виплати, коли безпечна угода людині доступна", async () => {
    process.env.SAFE_DEAL_MODE = "on";
    expect(await config(performerIdOf("pair-fop"))).toMatchObject({ safeDeal: true, performerPayouts: true });
    expect(await config(performerIdOf("pair-plain"))).toMatchObject({ safeDeal: true, performerPayouts: false });
    expect((await config()).performerPayouts).toBeUndefined();
  });

  it("при вимкненому режимі про виплати чужої людини не розповідає", async () => {
    process.env.SAFE_DEAL_MODE = "off";
    expect(await config(performerIdOf("pair-fop"))).toEqual({ safeDeal: false, methods: [] });
  });
});
