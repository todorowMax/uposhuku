import { beforeEach, describe, expect, it, vi } from "vitest";

const { calls, fail, run } = vi.hoisted(() => {
  const calls: string[] = [];
  const fail = { step: "" };
  const run = (name: string, value: unknown = null) => async () => {
    calls.push(name);
    if (fail.step === name) throw new Error(`збій ${name}`);
    return value;
  };
  return { calls, fail, run };
});
vi.mock("@/lib/server/deal-sweep", () => ({ runDealSweep: run("sweep", { released: 0 }) }));
vi.mock("@/lib/telegram/channel", () => ({ postDueRequests: run("post", { posted: 1 }), closeFinishedPosts: run("close", 2) }));
vi.mock("@/lib/server/telegram-repo", () => ({ pruneTelegram: run("prune_telegram") }));
vi.mock("@/lib/server/db", () => ({ getDb: () => ({ delete: () => ({ where: run("prune_db") }) }) }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn() }));

import { POST } from "@/app/api/internal/tick/route";
import { missingTickConfig } from "@/lib/server/tick-config";

const tick = () => POST(new Request("https://findlyfy.test/api/internal/tick", { method: "POST", headers: { authorization: "Bearer test-token" } }));

beforeEach(() => {
  calls.length = 0;
  fail.step = "";
  process.env.INTERNAL_TOKEN = "test-token";
});

describe("/api/internal/tick", () => {
  it("звірка грошей іде першою", async () => {
    expect((await tick()).status).toBe(200);
    expect(calls[0]).toBe("sweep");
  });

  it("збій поста в Telegram не скасовує решту кроків і не дає 500", async () => {
    fail.step = "post";
    const response = await tick();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, failed: ["post"] });
    expect(calls).toEqual(expect.arrayContaining(["sweep", "close", "prune_telegram", "prune_db"]));
  });

  it("збій звірки дає 500, але решта кроків виконана", async () => {
    fail.step = "sweep";
    const response = await tick();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ failed: ["sweep"] });
    expect(calls).toEqual(expect.arrayContaining(["post", "close", "prune_telegram"]));
  });

  it("без токена 401", async () => {
    expect((await POST(new Request("https://findlyfy.test/api/internal/tick", { method: "POST" }))).status).toBe(401);
  });
});

describe("налаштування cron", () => {
  it("називає відсутні змінні, а не мовчить", () => {
    expect(missingTickConfig({})).toEqual(["INTERNAL_TOKEN", "SITE_URL"]);
    expect(missingTickConfig({ INTERNAL_TOKEN: "x", SITE_URL: " " })).toEqual(["SITE_URL"]);
    expect(missingTickConfig({ INTERNAL_TOKEN: "x", SITE_URL: "https://findlyfy.com" })).toEqual([]);
  });
});
