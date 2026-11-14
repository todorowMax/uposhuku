// Репозиторій телефона (lib/server/phone-repo.ts): унікальність серед живих, могила з боргом і без, блок-лист, ключ;
// видалення акаунта лишає хеш і чистить маску; виписка показує маску.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const logs = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: (input: unknown) => void logs.calls.push(input), logServerError: vi.fn(), serverEvent: vi.fn() }));
vi.mock("@/lib/server/realtime", () => ({ pushUser: vi.fn(), pushGlobal: vi.fn(), userOfPerformer: () => null }));

import { eq } from "drizzle-orm";
import { feeEntries, phoneBlocks, users } from "@/db/schema";
import { phoneHash } from "@/lib/phone/hash";
import { deleteAccount } from "@/lib/server/account-delete";
import { buildAccountExport } from "@/lib/server/account-export";
import { getDb } from "@/lib/server/db";
import { bindPhone, isPhoneRequired, phoneStatus } from "@/lib/server/phone-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

const KEY = "test-phone-key";
const PHONE = "+380501234567";
let ctx: Awaited<ReturnType<typeof useTestD1>>;
const row = async (id: string) => (await getDb().select().from(users).where(eq(users.id, id)))[0];

beforeAll(async () => {
  ctx = await useTestD1();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  logs.calls = [];
  process.env.PHONE_HASH_KEY = KEY;
  await ctx.db.prepare("update users set phone_hash = null, phone_mask = null, phone_verified_at = null").run();
  await ctx.db.prepare("delete from phone_blocks").run();
});

const owe = async (userId: string, amount: number) =>
  getDb().insert(feeEntries).values({ id: `fe-${userId}-${amount}`, userId, kind: "accrual", amount, createdBy: "system", createdAt: 1 });

describe("bindPhone", () => {
  it("записує хеш, маску й час; номера в базі немає", async () => {
    await makeUser(ctx.db, "pr-a");
    expect(await bindPhone("pr-a", PHONE, 1234)).toBe("ok");
    const user = await row("pr-a");
    expect(user.phoneHash).toBe(await phoneHash(PHONE, KEY));
    expect(user.phoneMask).toBe("+380 •• ••• •• 67");
    expect(user.phoneVerifiedAt).toBe(1234);
    expect(JSON.stringify(user)).not.toContain("501234567");
    expect(await phoneStatus("pr-a")).toEqual({ verified: true, mask: "+380 •• ••• •• 67", verifiedAt: 1234 });
  });

  it("той самий номер на другому живому акаунті: taken, перший лишається власником", async () => {
    await makeUser(ctx.db, "pr-b1");
    await makeUser(ctx.db, "pr-b2");
    expect(await bindPhone("pr-b1", PHONE)).toBe("ok");
    expect(await bindPhone("pr-b2", PHONE)).toBe("taken");
    expect((await row("pr-b2")).phoneHash).toBeNull();
    expect((await row("pr-b1")).phoneHash).not.toBeNull();
    // Повторне підтвердження власником не конфліктує з самим собою.
    expect(await bindPhone("pr-b1", PHONE)).toBe("ok");
  });

  it("могила без боргу віддає номер новому акаунту й втрачає хеш", async () => {
    await makeUser(ctx.db, "pr-c-old");
    await makeUser(ctx.db, "pr-c-new");
    await bindPhone("pr-c-old", PHONE);
    expect(await deleteAccount("pr-c-old")).toEqual({ kind: "deleted" });
    expect(await bindPhone("pr-c-new", PHONE)).toBe("ok");
    expect((await row("pr-c-old")).phoneHash).toBeNull();
    expect((await row("pr-c-new")).phoneHash).not.toBeNull();
  });

  it("могила з боргом комісії тримає номер: blocked", async () => {
    await makeUser(ctx.db, "pr-d-old");
    await makeUser(ctx.db, "pr-d-new");
    await bindPhone("pr-d-old", PHONE);
    await owe("pr-d-old", 5000);
    expect(await deleteAccount("pr-d-old")).toEqual({ kind: "deleted" });
    expect(await bindPhone("pr-d-new", PHONE)).toBe("blocked");
    expect((await row("pr-d-old")).phoneHash).not.toBeNull();
    expect((await row("pr-d-new")).phoneHash).toBeNull();
  });

  it("блок-лист: blocked, навіть якщо номер вільний", async () => {
    await makeUser(ctx.db, "pr-e");
    await getDb().insert(phoneBlocks).values({ phoneHash: await phoneHash(PHONE, KEY), reason: "шахрайство", createdBy: "mod", createdAt: 1 });
    expect(await bindPhone("pr-e", PHONE)).toBe("blocked");
    expect((await row("pr-e")).phoneHash).toBeNull();
  });

  it("без ключа хешу: unavailable, нічого не записано, у журналі phone_hash_key_missing без номера", async () => {
    await makeUser(ctx.db, "pr-f");
    delete process.env.PHONE_HASH_KEY;
    expect(await bindPhone("pr-f", PHONE)).toBe("unavailable");
    expect((await row("pr-f")).phoneHash).toBeNull();
    expect(JSON.stringify(logs.calls)).toContain("phone_hash_key_missing");
    expect(JSON.stringify(logs.calls)).not.toContain("501234567");
  });
});

describe("isPhoneRequired", () => {
  it("лише коли прапорець увімкнений для пошти й номера немає", async () => {
    await makeUser(ctx.db, "pr-g");
    const me = { id: "pr-g", email: "pr-g@example.com" };
    delete process.env.PHONE_VERIFY_MODE;
    expect(await isPhoneRequired(me)).toBe(false);
    process.env.PHONE_VERIFY_MODE = "allowlist";
    process.env.PHONE_VERIFY_USERS = "pr-g@example.com";
    expect(await isPhoneRequired(me)).toBe(true);
    expect(await isPhoneRequired({ id: "pr-x", email: "other@example.com" })).toBe(false);
    await bindPhone("pr-g", PHONE);
    expect(await isPhoneRequired(me)).toBe(false);
    delete process.env.PHONE_VERIFY_MODE;
    delete process.env.PHONE_VERIFY_USERS;
  });
});

describe("видалення акаунта й виписка", () => {
  it("могила лишає хеш, маска й час підтвердження порожні", async () => {
    await makeUser(ctx.db, "pr-h");
    await bindPhone("pr-h", PHONE);
    await deleteAccount("pr-h");
    const user = await row("pr-h");
    expect(user.phoneHash).toBe(await phoneHash(PHONE, KEY));
    expect(user.phoneMask).toBeNull();
    expect(user.phoneVerifiedAt).toBeNull();
  });

  it("виписка показує маску й дату, не хеш", async () => {
    await makeUser(ctx.db, "pr-i");
    await bindPhone("pr-i", PHONE, Date.UTC(2026, 10, 14));
    const exported = JSON.stringify(await buildAccountExport("pr-i"));
    expect(exported).toContain("+380 •• ••• •• 67");
    expect(exported).toContain("2026-11-14");
    expect(exported).not.toContain(await phoneHash(PHONE, KEY));
  });
});
