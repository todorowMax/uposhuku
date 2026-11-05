import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
const mail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => session.user }));
vi.mock("@/lib/server/mail", () => ({ sendRequisitesChangeNotice: mail }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { GET, PUT } from "@/app/api/requisites/route";
import { GET as GET_DEAL } from "@/app/api/deals/[id]/requisites/route";
import { actAsPerformer, proposeDeal } from "@/lib/server/deal-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const KEY = Buffer.alloc(32, 5).toString("base64");

beforeAll(async () => {
  process.env.REQUISITES_KEY = KEY;
  ctx = await useTestD1();
  for (const id of ["rr-cust", "rr-perf", "rr-other"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  process.env.REQUISITES_KEY = KEY;
  mail.mockReset();
  session.user = { id: "rr-perf", email: "rr-perf@example.com" };
});

interface Body {
  outcome: { kind: string };
  requisites: { iban: string; recipient: string } | null;
  pending: { requisites: { recipient: string } } | null;
}
const body = async (response: Response) => (await response.json()) as Body;
const IBAN = "UA213223130000026007233566001";
const put = (body: unknown) => PUT(new Request("https://findlyfy.test/api/requisites", { method: "PUT", body: JSON.stringify(body) }));
const fields = (over: Record<string, unknown> = {}) => ({ recipient: "ФОП Іваненко", iban: IBAN, taxCode: "12345678", ...over });

describe("/api/requisites", () => {
  it("без входу 401, на кожну відповідь no-store", async () => {
    session.user = null;
    expect((await GET()).status).toBe(401);
    expect((await put(fields())).status).toBe(401);
  });

  it("номер картки, чужий хост і поганий IBAN відхиляються 400 й нічого не зберігають", async () => {
    expect((await put(fields({ iban: "4111111111111111" }))).status).toBe(400);
    expect((await put(fields({ payUrl: "https://evil.example/x" }))).status).toBe(400);
    expect((await put(fields({ iban: "UA000000000000000000000000000" }))).status).toBe(400);
    const own = await body(await GET());
    expect(own.requisites).toBeNull();
  });

  it("перше збереження одразу без листа; зміна чекає й шле лист", async () => {
    const first = await put(fields());
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect((await body(first)).outcome).toEqual({ kind: "saved" });
    expect(mail).not.toHaveBeenCalled();

    const second = await put(fields({ recipient: "ФОП Петренко" }));
    const result = await body(second);
    expect(result.outcome.kind).toBe("pending");
    expect(result.requisites?.recipient).toBe("ФОП Іваненко");
    expect(result.pending?.requisites.recipient).toBe("ФОП Петренко");
    expect(mail).toHaveBeenCalledTimes(1);
    expect(mail.mock.calls[0][0]).toBe("rr-perf@example.com");
    expect(JSON.stringify(mail.mock.calls)).not.toContain(IBAN);
  });

  it("без ключа шифрування 503, значення не зберігається", async () => {
    session.user = { id: "rr-other", email: "rr-other@example.com" };
    delete process.env.REQUISITES_KEY;
    expect((await put(fields())).status).toBe(503);
    process.env.REQUISITES_KEY = KEY;
    expect((await body(await GET())).requisites).toBeNull();
  });
});

describe("GET /api/deals/:id/requisites", () => {
  it("сторонам прийнятої прямої угоди знімок, стороннім 404", async () => {
    const deal = await proposeDeal("rr-cust", { requestId: "r", responseId: "x", method: "direct", performer: { id: "me-rr-perf", name: "П", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] });
    if (typeof deal === "string") throw new Error(deal);
    const ask = (userId: string | null) => {
      session.user = userId ? { id: userId, email: `${userId}@example.com` } : null;
      return GET_DEAL(new Request("https://findlyfy.test/x"), { params: Promise.resolve({ id: deal.id }) });
    };
    expect((await ask("rr-cust")).status).toBe(404); // ще не прийнята
    await actAsPerformer("rr-perf", deal.id, "accept", undefined);
    expect((await ask(null)).status).toBe(401);
    expect((await ask("rr-other")).status).toBe(404);
    const mine = await ask("rr-cust");
    expect(mine.status).toBe(200);
    expect(mine.headers.get("cache-control")).toBe("no-store");
    expect((await body(mine)).requisites?.iban).toBe(IBAN);
  });

  it("qr: true поза продом і false на проді, поки формат НБУ не перевірено", async () => {
    const deal = await proposeDeal("rr-cust", { requestId: "r2", responseId: "x2", method: "direct", performer: { id: "me-rr-perf", name: "П", avatarIndex: 0, specialty: "", fop: false }, stages: [{ title: "Все", amount: 500, days: 2 }] });
    if (typeof deal === "string") throw new Error(deal);
    await actAsPerformer("rr-perf", deal.id, "accept", undefined);
    session.user = { id: "rr-cust", email: "rr-cust@example.com" };
    const ask = async () => ((await (await GET_DEAL(new Request("https://findlyfy.test/x"), { params: Promise.resolve({ id: deal.id }) })).json()) as { qr: boolean }).qr;
    const before = process.env.DEPLOY_ENV;
    try {
      process.env.DEPLOY_ENV = "development";
      expect(await ask()).toBe(true);
      process.env.DEPLOY_ENV = "production";
      expect(await ask()).toBe(false);
    } finally {
      if (before === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = before;
    }
  });
});
