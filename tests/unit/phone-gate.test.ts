// Ворота телефона: замовник без підтвердженого номера не публікує запит, не пропонує й не приймає угоду (409 phone_required),
// коли прапорець phone_verify увімкнений для нього. Виконавця й вимкнений прапорець ворота не чіпають.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/notify-matching", () => ({ notifyMatchingPerformers: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), pushGlobal: vi.fn(), userOfPerformer: (id: string) => (id.startsWith("me-") ? id.slice(3) : null) }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { POST as CREATE_DEAL } from "@/app/api/conversations/[id]/deals/route";
import { POST as PROPOSE } from "@/app/api/deals/route";
import { POST as DEAL_ACTION } from "@/app/api/deals/[id]/route";
import { POST as PUBLISH } from "@/app/api/requests/route";
import { conversations } from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { bindPhone } from "@/lib/server/phone-repo";
import { seedDeal } from "../helpers/account-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

const ORIGIN = "https://findlyfy.test";
const as = (id: string) => (session.user = { id, email: `${id}@example.com`, name: null });
const post = (body: unknown) => new Request(`${ORIGIN}/x`, { method: "POST", body: JSON.stringify(body) });
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
const codeOf = async (response: Response) => ((await response.json()) as { code?: string; detail?: string }).code;
const DEAL = { title: "Сайт", description: "Опис", method: "direct", stages: [{ title: "Е", amount: 500, days: 3 }] };

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["pg-cust", "pg-perf", "pg-ok"]) await makeUser(ctx.db, id);
  await getDb().insert(conversations).values({ id: "pg-conv", customerUserId: "pg-cust", performerId: "me-pg-perf", performerUserId: "pg-perf", performerName: "Виконавець", createdAt: 1, updatedAt: 1 } as never);
  // Умови виставив виконавець: замовник їх приймає.
  const deal = await seedDeal({ id: "pg-deal", owner: "pg-cust", performer: "pg-perf", status: "proposed", stages: ["pending"] });
  await ctx.db.prepare("update deals set data = ? where id = 'pg-deal'").bind(JSON.stringify({ ...deal, proposedBy: "performer" })).run();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  process.env.PHONE_HASH_KEY = "gate-key";
  process.env.PHONE_VERIFY_MODE = "allowlist";
  process.env.PHONE_VERIFY_USERS = "pg-cust@example.com,pg-perf@example.com,pg-ok@example.com";
});
afterEach(() => {
  for (const name of ["PHONE_HASH_KEY", "PHONE_VERIFY_MODE", "PHONE_VERIFY_USERS"]) delete process.env[name];
});

const customerActions = () => [
  { name: "публікація запиту", run: () => PUBLISH(post({ text: "Потрібен сайт для кав'ярні" })) },
  { name: "пропозиція угоди за відгуком", run: () => PROPOSE(post({ requestId: "r", responseId: "x", performer: { id: "me-pg-perf" }, stages: [] })) },
  { name: "пропозиція умов у розмові", run: () => CREATE_DEAL(post(DEAL), ctxOf("pg-conv")) },
  { name: "прийняття угоди", run: () => DEAL_ACTION(post({ action: "accept" }), ctxOf("pg-deal")) },
];

describe("ворота телефона", () => {
  it("замовник без телефона: усі дії дають 409 phone_required з текстом", async () => {
    as("pg-cust");
    for (const action of customerActions()) {
      const response = await action.run();
      expect(response.status, action.name).toBe(409);
      expect(await codeOf(response.clone()), action.name).toBe("phone_required");
      expect(((await response.json()) as { detail: string }).detail).toBe("Підтвердіть телефон, щоб публікувати запити й домовлятися про угоди.");
    }
  });

  it("з підтвердженим телефоном дії проходять далі (не phone_required); прийняття угоди дає 200", async () => {
    await bindPhone("pg-ok", "+380509998877");
    as("pg-ok");
    expect((await PUBLISH(post({ text: "Потрібен сайт для кав'ярні" }))).status).toBe(201);
    expect(await codeOf(await PROPOSE(post({ requestId: "r", responseId: "x", performer: { id: "me-pg-perf" }, stages: [] })))).not.toBe("phone_required");
    // Власник угоди: підтверджений телефон на pg-cust.
    await bindPhone("pg-cust", "+380509998866");
    as("pg-cust");
    expect(await codeOf(await CREATE_DEAL(post(DEAL), ctxOf("pg-conv")))).not.toBe("phone_required");
    const accepted = await DEAL_ACTION(post({ action: "accept" }), ctxOf("pg-deal"));
    expect(accepted.status).toBe(200);
    await ctx.db.prepare("update users set phone_hash = null, phone_mask = null, phone_verified_at = null where id = 'pg-cust'").run();
  });

  it("прапорець вимкнений: поведінка як раніше, навіть без телефона", async () => {
    delete process.env.PHONE_VERIFY_MODE;
    as("pg-cust");
    expect((await PUBLISH(post({ text: "Потрібен сайт для кав'ярні" }))).status).toBe(201);
    for (const action of customerActions()) expect(await codeOf(await action.run()), action.name).not.toBe("phone_required");
  });

  it("виконавця ворота не чіпають: він виставляє умови й приймає угоду без телефона", async () => {
    as("pg-perf");
    expect(await codeOf(await CREATE_DEAL(post(DEAL), ctxOf("pg-conv")))).not.toBe("phone_required");
    expect(await codeOf(await DEAL_ACTION(post({ as: "performer", action: "accept" }), ctxOf("pg-deal")))).not.toBe("phone_required");
  });
});
