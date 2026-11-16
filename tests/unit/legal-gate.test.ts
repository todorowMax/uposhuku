// Ворота згод (lib/server/legal-gate.ts) напряму: legalGate (умови й політика чинної версії), riskGate (ризик крипти),
// cryptoGate (спершу умови, потім ризик) і termsRequired (вхід без галочки). Крізь маршрути це покрито в
// legal-accept.test.ts; тут межі версій і форма відповіді.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGAL_REACCEPT_CODE, RISK_ACK_CODE } from "@/lib/legal/codes";
import { LEGAL_VERSIONS } from "@/lib/legal/config";
import type { LegalVersions } from "@/lib/legal/acceptance";
import { recordAcceptance } from "@/lib/server/legal-repo";
import { cryptoGate, legalGate, riskGate, termsRequired } from "@/lib/server/legal-gate";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});

const OLD = "2000-01-01";
/** Версія, яка новіша за чинну: рядки дат порівнюються як текст. */
const NEWER = "2999-12-31";
const bare = (id: string) => makeUser(ctx.db, id, { accepted: false });
const accept = (userId: string, docs: Parameters<typeof recordAcceptance>[0]["docs"], versions?: Partial<LegalVersions>) =>
  recordAcceptance({ userId, docs, versions: { ...LEGAL_VERSIONS, ...versions } });
const body = async (response: Response | null) => (await response!.json()) as { type: string; title: string; status: number; detail: string; code?: string };

describe("legalGate: умови й політика чинної версії", () => {
  it("нічого не приймав: 409 legal_reaccept_required з типом, заголовком і текстом для людини", async () => {
    const response = await legalGate(await bare("lg-none"));
    expect(response?.status).toBe(409);
    expect(response?.headers.get("content-type")).toBe("application/problem+json");
    expect(await body(response)).toEqual({
      type: "/problems/legal-reaccept-required",
      title: "Потрібно прийняти оновлені умови",
      status: 409,
      detail: "Ми оновили умови. Прийміть їх, щоб продовжити.",
      code: LEGAL_REACCEPT_CODE,
    });
  });

  it("невідомий користувач (немає рядка в базі) теж закритий, а не відкритий", async () => {
    expect((await legalGate("lg-ghost"))?.status).toBe(409);
  });

  it("умови й політика чинної версії прийняті: пропускає", async () => {
    const id = await bare("lg-ok");
    await accept(id, ["terms", "privacy"]);
    expect(await legalGate(id)).toBeNull();
  });

  it("прийнято лише одне з двох: блокує", async () => {
    const onlyTerms = await bare("lg-terms");
    await accept(onlyTerms, ["terms"]);
    expect((await legalGate(onlyTerms))?.status).toBe(409);
    const onlyPrivacy = await bare("lg-privacy");
    await accept(onlyPrivacy, ["privacy"]);
    expect((await legalGate(onlyPrivacy))?.status).toBe(409);
  });

  it("стара версія не рахується; чинна або новіша рахується; найновіша з прийнятих вирішує", async () => {
    const stale = await bare("lg-stale");
    await accept(stale, ["terms", "privacy"], { terms: OLD, privacy: OLD });
    expect((await legalGate(stale))?.status).toBe(409);
    // Політику оновили, умови ні.
    await accept(stale, ["privacy"]);
    expect((await legalGate(stale))?.status).toBe(409);
    await accept(stale, ["terms"]);
    expect(await legalGate(stale)).toBeNull();

    const ahead = await bare("lg-ahead");
    await accept(ahead, ["terms", "privacy"], { terms: NEWER, privacy: NEWER });
    expect(await legalGate(ahead)).toBeNull();
  });

  it("оферта й ризик крипти для legalGate не потрібні: гроші в гривні їх не вимагають", async () => {
    const id = await bare("lg-extra");
    await accept(id, ["terms", "privacy"]);
    expect(await legalGate(id)).toBeNull();
  });

  it("ризик крипти без умов умов не замінює", async () => {
    const id = await bare("lg-risk-only");
    await accept(id, ["cryptoRisk"]);
    expect((await legalGate(id))?.status).toBe(409);
  });
});

describe("riskGate: ризик крипти", () => {
  it("не підтверджував: 409 risk_ack_required з текстом", async () => {
    const response = await riskGate(await bare("rg-none"));
    expect(response?.status).toBe(409);
    expect(await body(response)).toEqual({
      type: "/problems/risk-ack-required",
      title: "Підтвердьте ризики",
      status: 409,
      detail: "Перед дією з USDT підтвердьте, що розумієте ризики.",
      code: RISK_ACK_CODE,
    });
  });

  it("умови прийняті, ризик ні: усе одно блокує; після підтвердження чинної версії пропускає", async () => {
    const id = await bare("rg-terms");
    await accept(id, ["terms", "privacy"]);
    expect((await riskGate(id))?.status).toBe(409);
    await accept(id, ["cryptoRisk"]);
    expect(await riskGate(id)).toBeNull();
  });

  it("стара версія ризику не годиться, новіша годиться", async () => {
    const stale = await bare("rg-stale");
    await accept(stale, ["cryptoRisk"], { cryptoRisk: OLD });
    expect((await riskGate(stale))?.status).toBe(409);
    const ahead = await bare("rg-ahead");
    await accept(ahead, ["cryptoRisk"], { cryptoRisk: NEWER });
    expect(await riskGate(ahead)).toBeNull();
  });

  it("невідомий користувач закритий", async () => {
    expect((await riskGate("rg-ghost"))?.status).toBe(409);
  });
});

describe("cryptoGate: спершу умови, потім ризик", () => {
  it("немає ні того, ні того: просить умови (код legal_reaccept_required)", async () => {
    expect((await body(await cryptoGate(await bare("cg-none")))).code).toBe(LEGAL_REACCEPT_CODE);
  });

  it("умови прийняті, ризику немає: просить ризик", async () => {
    const id = await bare("cg-terms");
    await accept(id, ["terms", "privacy"]);
    expect((await body(await cryptoGate(id))).code).toBe(RISK_ACK_CODE);
  });

  it("ризик прийнято, умови застаріли: просить умови, а не пропускає", async () => {
    const id = await bare("cg-risk");
    await accept(id, ["terms", "privacy"], { terms: OLD, privacy: OLD });
    await accept(id, ["cryptoRisk"]);
    expect((await body(await cryptoGate(id))).code).toBe(LEGAL_REACCEPT_CODE);
  });

  it("усе прийнято: пропускає", async () => {
    const id = await bare("cg-all");
    await accept(id, ["terms", "privacy", "cryptoRisk"]);
    expect(await cryptoGate(id)).toBeNull();
  });
});

describe("termsRequired: вхід без галочки", () => {
  it("400 terms_required з типом і текстом", async () => {
    const response = termsRequired();
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({
      type: "/problems/terms-required",
      title: "Потрібна згода з умовами",
      status: 400,
      detail: "Підтвердьте, що вам є 18 років і ви приймаєте умови та політику конфіденційності.",
      code: "terms_required",
    });
  });
});
