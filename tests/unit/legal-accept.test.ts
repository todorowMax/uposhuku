import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
const sent = vi.hoisted(() => vi.fn());
vi.mock("next/headers", async () => (await import("../helpers/cookie-jar")).nextHeadersMock());
vi.mock("@/lib/server/auth", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/mail", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/mail")), sendLoginCode: sent, sendRequisitesChangeNotice: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null), pushGlobal: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { authAttempts, conversations, legalAcceptances, users } from "@/db/schema";
import { POST as VERIFY } from "@/app/api/auth/email/verify/route";
import { GET as GOOGLE_CALLBACK } from "@/app/api/auth/google/callback/route";
import { GET as STATUS } from "@/app/api/legal/status/route";
import { POST as ACCEPT } from "@/app/api/legal/accept/route";
import { POST as REVIEW } from "@/app/api/reviews/route";
import { POST as PLACEMENT } from "@/app/api/placement/route";
import { POST as PAY } from "@/app/api/deals/[id]/pay/route";
import { POST as DEAL_ACTION } from "@/app/api/deals/[id]/route";
import { POST as PROOF } from "@/app/api/deals/[id]/crypto-proof/route";
import { POST as WALLET_PAY } from "@/app/api/deals/[id]/wallet-pay/route";
import { POST as ESCROW_SYNC } from "@/app/api/deals/[id]/escrow-sync/route";
import { POST as CREATE_DEAL } from "@/app/api/conversations/[id]/deals/route";
import { PUT as SAVE_REQ } from "@/app/api/requisites/route";
import { POST as CHALLENGE } from "@/app/api/requisites/wallet/challenge/route";
import { POST as WALLET_VERIFY } from "@/app/api/requisites/wallet/route";
import { tronAddressFromHex } from "@/lib/crypto/tron-address";
import { isAccepted, pendingDocs, readAcceptRequest, REQUIRED_DOCS, type LegalVersions } from "@/lib/legal/acceptance";
import { formatLegalDate, LEGAL_VERSIONS, UPDATED } from "@/lib/legal/config";
import { startEmailLogin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { latestAccepted, needsTermsAcceptance, pendingFor, recordAcceptance } from "@/lib/server/legal-repo";
import { proposeDeal } from "@/lib/server/deal-repo";
import { codeSentTo, userIdOf } from "../helpers/auth-flow";
import { cookieJar } from "../helpers/cookie-jar";
import { makeUser, useTestD1 } from "../helpers/d1";
import { draft, FACTORY, KEY, TOKEN } from "../helpers/escrow-fixtures";

const ORIGIN = "https://findlyfy.test";
const IBAN = "UA213223130000026007233566001";
const TRON_ADDRESS = tronAddressFromHex("a".repeat(40));
const as = (id: string) => (session.user = { id, email: `${id}@example.com` });
const post = (body: unknown, url = `${ORIGIN}/x`) => new Request(url, { method: "POST", body: JSON.stringify(body) });
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
const code = async (response: Response) => ((await response.json()) as { code?: string }).code;
const rows = async (userId: string) => getDb().select().from(legalAcceptances).where(eq(legalAcceptances.userId, userId));
const ENV = ["RESEND_API_KEY", "AUTH_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DEPLOY_ENV", "MAIL_MODE"];
const CRYPTO_ENV = ["CRYPTO_PROOF_MODE", "CRYPTO_WALLET_MODE", "CRYPTO_ESCROW_MODE", "CRYPTO_CHAIN_ID", "CRYPTO_TOKEN_ADDRESS", "CRYPTO_FACTORY_ADDRESS", "CRYPTO_RPC_URL"];
let counter = 0;

/** Користувач без жодної згоди: умови й ризик ще не приймав. */
const bare = async (tag: string) => {
  counter++;
  return makeUser(ctx.db, `${tag}-${counter}`, { accepted: false });
};
/** Умови прийняті, ризик крипти ні. */
const termsOnly = async (tag: string) => {
  const id = await bare(tag);
  await recordAcceptance({ userId: id, docs: REQUIRED_DOCS, source: "signup" });
  return id;
};

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  process.env.REQUISITES_KEY = KEY;
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await getDb().delete(authAttempts);
  process.env.REQUISITES_KEY = KEY;
  for (const name of ENV) delete process.env[name];
  process.env.RESEND_API_KEY = "test-key";
  process.env.AUTH_SECRET = "l".repeat(40);
  sent.mockReset();
  cookieJar.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of CRYPTO_ENV) delete process.env[name];
});

describe("версії документів", () => {
  it("дата на сторінці будується від версії", () => {
    expect(formatLegalDate("2026-11-13")).toBe("13 листопада 2026 року");
    expect(UPDATED.terms).toBe(formatLegalDate(LEGAL_VERSIONS.terms));
    expect(UPDATED.safeDealOffer).toBe(formatLegalDate(LEGAL_VERSIONS.safeDealOffer));
  });

  it("нова версія документа вимагає повторного прийняття, стара прийнята версія не рахується", () => {
    const next: LegalVersions = { ...LEGAL_VERSIONS, terms: "2027-01-01" };
    const latest = { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy };
    expect(pendingDocs(latest)).toEqual([]);
    expect(pendingDocs(latest, { versions: next })).toEqual([{ doc: "terms", version: "2027-01-01" }]);
    expect(isAccepted(latest, "terms", next)).toBe(false);
    expect(isAccepted({ terms: "2027-02-01" }, "terms", next)).toBe(true);
  });

  it("запит «Приймаю»: невідомий документ це 400, чужа чи стара версія 409", () => {
    expect(readAcceptRequest({ docs: [{ doc: "terms", version: LEGAL_VERSIONS.terms }] })).toEqual({ ok: true, docs: ["terms"] });
    expect(readAcceptRequest({ docs: [{ doc: "secret", version: "2026-11-13" }] })).toMatchObject({ ok: false, status: 400 });
    expect(readAcceptRequest({ docs: [{ doc: "terms", version: "2020-01-01" }] })).toMatchObject({ ok: false, status: 409 });
    expect(readAcceptRequest({ docs: [{ doc: "terms", version: "2099-01-01" }] })).toMatchObject({ ok: false, status: 409 });
    expect(readAcceptRequest({ docs: [] })).toMatchObject({ ok: false, status: 400 });
    expect(readAcceptRequest({})).toMatchObject({ ok: false, status: 400 });
  });
});

describe("вхід: галочка обов'язкова на сервері", () => {
  const verify = (body: Record<string, unknown>) => VERIFY(post(body));

  it("новий акаунт без accepted: 400 до перевірки коду, сесії й запису немає", async () => {
    const email = `new-${++counter}@example.com`;
    await startEmailLogin(email, "10.7.0.1");
    const response = await verify({ email, code: codeSentTo(sent, email) });
    expect(response.status).toBe(400);
    expect(await code(response)).toBe("terms_required");
    expect(cookieJar.get("vm_session")).toBeUndefined();
    expect(await rows(await userIdOf(email))).toHaveLength(0);
    // Код не згорів: з галочкою той самий код проходить.
    expect((await verify({ email, code: codeSentTo(sent, email), accepted: true })).status).toBe(200);
  });

  it("accepted не булеве true (рядок, 1) не годиться", async () => {
    const email = `new-${++counter}@example.com`;
    await startEmailLogin(email, "10.7.0.2");
    for (const accepted of ["true", 1, "yes"]) expect((await verify({ email, code: codeSentTo(sent, email), accepted })).status).toBe(400);
  });

  it("з accepted записує умови й політику чинних версій з джерелом signup і хешем IP, не сирим IP", async () => {
    const email = `new-${++counter}@example.com`;
    await startEmailLogin(email, "10.7.0.3");
    const request = new Request(`${ORIGIN}/x`, { method: "POST", headers: { "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify({ email, code: codeSentTo(sent, email), accepted: true }) });
    expect((await VERIFY(request)).status).toBe(200);
    const saved = await rows(await userIdOf(email));
    expect(saved.map((row) => `${row.doc}:${row.version}:${row.source}`).sort()).toEqual([`privacy:${LEGAL_VERSIONS.privacy}:signup`, `terms:${LEGAL_VERSIONS.terms}:signup`]);
    for (const row of saved) {
      expect(row.ipHash).toMatch(/^[0-9a-f]{16}$/);
      expect(row.ipHash).not.toContain("203");
    }
  });

  it("існуючому користувачу з чинними версіями галочка не потрібна", async () => {
    const email = `old-${++counter}@example.com`;
    await makeUser(ctx.db, `old-${counter}`, { email });
    await startEmailLogin(email, "10.7.0.4");
    expect(await needsTermsAcceptance({ email })).toBe(false);
    expect((await verify({ email, code: codeSentTo(sent, email) })).status).toBe(200);
  });

  it("існуючому без згод (зайшов до цієї версії) галочка потрібна", async () => {
    const id = await bare("legacy");
    const email = `${id}@example.com`;
    await startEmailLogin(email, "10.7.0.5");
    expect(await needsTermsAcceptance({ email })).toBe(true);
    expect((await verify({ email, code: codeSentTo(sent, email) })).status).toBe(400);
  });

  it("Google: без згоди в cookie стану новий акаунт не відкривається, зі згодою записується", async () => {
    process.env.GOOGLE_CLIENT_ID = "123.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    const email = `google-${++counter}@example.com`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("oauth2.googleapis.com/token") ? Response.json({ access_token: "at" }) : Response.json({ sub: `gid-${counter}`, email, email_verified: true }),
      ),
    );
    const callback = (accepted: boolean) =>
      GOOGLE_CALLBACK(new Request(`${ORIGIN}/api/auth/google/callback?code=c&state=s`, { headers: { cookie: `vm_google_state=${encodeURIComponent(JSON.stringify({ state: "s", next: "/", accepted }))}` } }));
    const refused = await callback(false);
    expect(refused.status).toBe(400);
    expect(await code(refused)).toBe("terms_required");
    expect(await getDb().select().from(users).where(eq(users.email, email))).toHaveLength(0);
    expect((await callback(true)).status).toBe(307);
    expect((await rows(await userIdOf(email))).map((row) => row.doc).sort()).toEqual(["privacy", "terms"]);
  });
});

describe("POST /api/legal/accept і статус", () => {
  it("статус показує непринятые документы; прийняття прибирає їх; повтор не плодить рядків", async () => {
    const id = await bare("acc");
    as(id);
    const before = (await (await STATUS(new Request(`${ORIGIN}/x`))).json()) as { pending: { doc: string }[]; riskAccepted: boolean };
    expect(before.pending.map((item) => item.doc)).toEqual(["terms", "privacy"]);
    expect(before.riskAccepted).toBe(false);
    const body = { docs: REQUIRED_DOCS.map((doc) => ({ doc, version: LEGAL_VERSIONS[doc] })) };
    for (let attempt = 0; attempt < 3; attempt++) expect((await ACCEPT(post(body))).status).toBe(200);
    expect(await rows(id)).toHaveLength(2);
    expect(await pendingFor(id)).toEqual([]);
    expect((await rows(id)).every((row) => row.source === "reaccept")).toBe(true);
  });

  it("чужі й старі версії не приймаються, нічого не пишеться", async () => {
    const id = await bare("acc");
    as(id);
    expect((await ACCEPT(post({ docs: [{ doc: "terms", version: "2020-01-01" }] }))).status).toBe(409);
    expect((await ACCEPT(post({ docs: [{ doc: "nope", version: LEGAL_VERSIONS.terms }] }))).status).toBe(400);
    expect((await ACCEPT(post({ docs: [{ doc: "terms", version: LEGAL_VERSIONS.terms }, { doc: "privacy", version: "1999-01-01" }] }))).status).toBe(409);
    expect(await rows(id)).toHaveLength(0);
  });

  it("гість: 401", async () => {
    session.user = null;
    expect((await ACCEPT(post({ docs: [] }))).status).toBe(401);
    expect((await STATUS(new Request(`${ORIGIN}/x`))).status).toBe(401);
  });

  it("ризик крипти пишеться з джерелом payment_risk і лишається найновішою версією", async () => {
    const id = await termsOnly("risk");
    as(id);
    expect((await ACCEPT(post({ docs: [{ doc: "cryptoRisk", version: LEGAL_VERSIONS.cryptoRisk }] }))).status).toBe(200);
    expect((await rows(id)).find((row) => row.doc === "cryptoRisk")?.source).toBe("payment_risk");
    expect((await latestAccepted(id)).cryptoRisk).toBe(LEGAL_VERSIONS.cryptoRisk);
  });
});

describe("грошові дії без прийнятих умов: 409 legal_reaccept_required", () => {
  it("відгук, розміщення, оплата безпечної угоди, «я оплатив(ла)», заморозка", async () => {
    const id = await bare("money");
    as(id);
    const refused = [
      await REVIEW(post({ dealId: "x", stars: 5 })),
      await PLACEMENT(post({ amount: 100 })),
      await PAY(post({}), ctxOf("d1")),
      await DEAL_ACTION(post({ action: "claim_paid", via: "bank" }), ctxOf("d1")),
      await DEAL_ACTION(post({ action: "fund" }), ctxOf("d1")),
      await DEAL_ACTION(post({ as: "performer", action: "accept" }), ctxOf("d1")),
      await CREATE_DEAL(post({ title: "t", method: "direct", stages: [] }), ctxOf("c1")),
    ];
    for (const response of refused) {
      expect(response.status).toBe(409);
      expect(await code(response)).toBe("legal_reaccept_required");
    }
  });

  it("після прийняття ті самі запити доходять до своїх звичайних відповідей", async () => {
    const id = await termsOnly("money");
    as(id);
    expect((await REVIEW(post({ dealId: "x", stars: 5 }))).status).toBe(404);
    expect(await code(await PAY(post({}), ctxOf("d1")))).not.toBe("legal_reaccept_required");
    expect((await DEAL_ACTION(post({ action: "fund" }), ctxOf("d1"))).status).toBe(404);
  });

  it("чат і читання не блокуються: статус працює без прийняття", async () => {
    as(await bare("read"));
    expect((await STATUS(new Request(`${ORIGIN}/x`))).status).toBe(200);
  });

  it("нова версія умов знову закриває гроші для того, хто приймав стару", async () => {
    const id = await termsOnly("bump");
    as(id);
    await getDb().update(legalAcceptances).set({ version: "2020-01-01" }).where(eq(legalAcceptances.userId, id));
    const response = await REVIEW(post({ dealId: "x", stars: 5 }));
    expect(response.status).toBe(409);
    expect(await code(response)).toBe("legal_reaccept_required");
  });
});

describe("дії з USDT без ризику: 409 risk_ack_required, після прийняття проходять", () => {
  const setup = () => {
    Object.assign(process.env, {
      CRYPTO_PROOF_MODE: "on",
      CRYPTO_WALLET_MODE: "on",
      CRYPTO_ESCROW_MODE: "on",
      CRYPTO_CHAIN_ID: "31337",
      CRYPTO_TOKEN_ADDRESS: TOKEN,
      CRYPTO_FACTORY_ADDRESS: FACTORY,
      CRYPTO_RPC_URL: "http://127.0.0.1:8545",
    });
  };
  /** `skipAfter`: дія з побічним записом, її після прийняття перевіряємо окремо. */
  const attempts = (): { name: string; run: () => Promise<Response>; skipAfter?: boolean }[] => [
    { name: "хеш USDT", run: () => PROOF(post({ hash: "a".repeat(64) }), ctxOf("d1")) },
    { name: "оплата з гаманця", run: () => WALLET_PAY(post({ hash: `0x${"a".repeat(64)}` }), ctxOf("d1")) },
    { name: "USDT-адреса в реквізитах", run: () => SAVE_REQ(new Request(`${ORIGIN}/x`, { method: "PUT", body: JSON.stringify({ recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678", usdtTrc20: TRON_ADDRESS }) })) },
    { name: "Binance ID в реквізитах", run: () => SAVE_REQ(new Request(`${ORIGIN}/x`, { method: "PUT", body: JSON.stringify({ recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678", binanceId: "123456789" }) })), skipAfter: true },
    { name: "підтвердження кошелька, запит на підпис", run: () => CHALLENGE(post({ address: "0x00000000000000000000000000000000000d4444" })) },
    { name: "підтвердження кошелька, підпис", run: () => WALLET_VERIFY(post({ nonce: "n", signature: "s" })) },
    { name: "оплата «я оплатив» USDT", run: () => DEAL_ACTION(post({ action: "claim_paid", via: "usdt" }), ctxOf("d1")) },
    { name: "оплата «я оплатив» Binance", run: () => DEAL_ACTION(post({ action: "claim_paid", via: "binance" }), ctxOf("d1")) },
    { name: "створення ескроу-угоди", run: () => CREATE_DEAL(post({ title: "t", method: "escrow", stages: [{ title: "Е", amount: 10, days: 3 }] }), ctxOf("conv-risk")), skipAfter: true },
  ];

  it("кожен вхід перевіряє ризик на сервері", async () => {
    setup();
    await makeUser(ctx.db, "risk-perf");
    const id = await bare("risk-cust");
    await getDb().insert(conversations).values({ id: "conv-risk", customerUserId: id, performerId: "me-risk-perf", performerUserId: "risk-perf", performerName: "Виконавець", createdAt: 1, updatedAt: 1 } as never).onConflictDoNothing();
    await recordAcceptance({ userId: id, docs: REQUIRED_DOCS, source: "signup" });
    as(id);
    for (const attempt of attempts()) {
      const response = await attempt.run();
      expect(response.status, attempt.name).toBe(409);
      expect(await code(response), attempt.name).toBe("risk_ack_required");
    }
  });

  it("після прийняття ризику ті самі дії вже не дають risk_ack_required", async () => {
    setup();
    const id = await termsOnly("risk-ok");
    await recordAcceptance({ userId: id, docs: ["cryptoRisk"] });
    as(id);
    for (const attempt of attempts().filter((item) => !item.skipAfter)) {
      const response = await attempt.run();
      expect(await code(response), attempt.name).not.toBe("risk_ack_required");
    }
    expect((await SAVE_REQ(new Request(`${ORIGIN}/x`, { method: "PUT", body: JSON.stringify({ recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678", binanceId: "123456789" }) }))).status).toBe(200);
  });

  it("прив'язка гаманця замовника в escrow-sync потребує ризику; звірка без client ні", async () => {
    setup();
    const cust = await termsOnly("esc-cust");
    await makeUser(ctx.db, "esc-risk-perf");
    const deal = await proposeDeal(cust, draft({ performer: { id: "me-esc-risk-perf", name: "Виконавець", avatarIndex: 0, specialty: "", fop: false }, responseId: "risk-sync", requestId: "direct:risk-sync" }), { safeEnabled: false, escrowMax: 1000 });
    if (typeof deal === "string") throw new Error(deal);
    as(cust);
    const withClient = await ESCROW_SYNC(post({ stageId: deal.stages[0].id, client: "0x00000000000000000000000000000000000c3333" }), ctxOf(deal.id));
    expect(withClient.status).toBe(409);
    expect(await code(withClient)).toBe("risk_ack_required");
    const without = await ESCROW_SYNC(post({ stageId: deal.stages[0].id }), ctxOf(deal.id));
    expect(await code(without)).not.toBe("risk_ack_required");
    await recordAcceptance({ userId: cust, docs: ["cryptoRisk"] });
    const after = await ESCROW_SYNC(post({ stageId: deal.stages[0].id, client: "0x00000000000000000000000000000000000c3333" }), ctxOf(deal.id));
    expect(await code(after)).not.toBe("risk_ack_required");
  });

  it("без умов (legal) крипто-дія просить спершу умови", async () => {
    setup();
    as(await bare("risk-legal"));
    const response = await PROOF(post({ hash: "a".repeat(64) }), ctxOf("d1"));
    expect(await code(response)).toBe("legal_reaccept_required");
  });
});
