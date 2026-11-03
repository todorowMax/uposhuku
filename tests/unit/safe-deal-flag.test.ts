import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SAFE_DEAL_ENABLED } from "@/lib/deals/flags";
import { isFop } from "@/lib/deals/fop";
import { applyAction, SAFE_DEAL_UNAVAILABLE, validateDraft } from "@/lib/deals/machine";
import type { Deal, DealDraft } from "@/lib/deals/types";
import { LEGAL_LINKS } from "@/lib/legal/links";
import { proposeDeal } from "@/lib/server/deal-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

// Прапорець вимкнено (так і є в коді): безпечної угоди немає ні на сервері, ні в ФОП-статусі, ні в списку документів.

const performer = { id: "me-flag-perf", name: "Юлія", avatarIndex: 1, specialty: "Дизайнерка", fop: true };
const draft = (over: Partial<DealDraft> = {}): DealDraft => ({
  requestId: "r-flag",
  responseId: "resp-flag",
  performer,
  method: "safe",
  stages: [{ title: "Робота", amount: 10000, days: 7 }],
  ...over,
});

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  await makeUser(ctx.db, "flag-c");
});
afterAll(async () => {
  await ctx.close();
});

describe("безпечна угода вимкнена прапорцем", () => {
  it("прапорець справді вимкнено", () => {
    expect(SAFE_DEAL_ENABLED).toBe(false);
  });

  it("чернетку з методом safe відхиляє навіть для ФОП, прямий переказ проходить", () => {
    expect(validateDraft(draft())).toBe(SAFE_DEAL_UNAVAILABLE);
    expect(validateDraft(draft({ method: "direct" }))).toBeNull();
  });

  it("створення safe-угоди в репозиторії повертає помилку й нічого не пише", async () => {
    expect(await proposeDeal("flag-c", draft(), 1_000_000)).toBe(SAFE_DEAL_UNAVAILABLE);
    const direct = await proposeDeal("flag-c", draft({ method: "direct" }), 1_000_001);
    expect(typeof direct).toBe("object");
  });

  it("заморожування (fund) відхиляється, навіть для вже збереженої safe-угоди", () => {
    const stored: Deal = {
      id: "deal-old",
      requestId: "r-flag",
      responseId: "resp-old",
      performer,
      method: "safe",
      status: "accepted",
      stages: [{ id: "s1", title: "Робота", amount: 10000, days: 7, status: "pending" }],
      createdAt: new Date(0).toISOString(),
      number: "#OLD1",
    };
    expect(applyAction(stored, "fund", undefined, 1_000_000, { card: "ua" })).toBe(SAFE_DEAL_UNAVAILABLE);
  });

  it("ФОП-статус не вигадуємо: isFop завжди false", () => {
    for (const id of ["a", "b", "c", "kyiv-1", "me-x"]) expect(isFop(id)).toBe(false);
  });

  it("оферти для виконавців немає в списку документів", () => {
    expect(LEGAL_LINKS.some((link) => link.href === "/offer/safe-deal")).toBe(false);
  });
});
