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
vi.mock("@/lib/telegram/channel", () => ({ postDueRequests: run("post", { posted: 1 }), closeFinishedPosts: run("close", 2), syncEditedPosts: run("edit_posts", 1), removeOptedOutPosts: run("remove_posts", 3) }));
vi.mock("@/lib/server/account-retention", () => ({ purgeExpiredRequisites: run("purge_requisites", 2) }));
vi.mock("@/lib/server/tick-cleanup", () => ({
  pruneSessions: run("prune_sessions", 3),
  pruneEmailCodes: run("prune_email_codes", 2),
  pruneReleaseCodes: run("prune_release_codes", 1),
  pruneOrphanAttachments: run("prune_chat_photos", 4),
}));
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

  it("пости після правки оновлюються до закриття; збій цього кроку не скасовує решту", async () => {
    const response = await tick();
    expect(await response.json()).toMatchObject({ ok: true, edited: 1, closed: 2 });
    expect(calls.indexOf("edit_posts")).toBeLessThan(calls.indexOf("close"));
    fail.step = "edit_posts";
    calls.length = 0;
    expect(await (await tick()).json()).toMatchObject({ ok: false, failed: ["edit_posts"], edited: null });
    expect(calls).toEqual(expect.arrayContaining(["close", "prune_telegram"]));
  });

  it("пости зі знятою галочкою видаляються до редагування; збій цього кроку не скасовує решту", async () => {
    expect(await (await tick()).json()).toMatchObject({ ok: true, removed: 3 });
    expect(calls.indexOf("remove_posts")).toBeLessThan(calls.indexOf("edit_posts"));
    fail.step = "remove_posts";
    calls.length = 0;
    expect(await (await tick()).json()).toMatchObject({ ok: false, failed: ["remove_posts"], removed: null });
    expect(calls).toEqual(expect.arrayContaining(["edit_posts", "close", "prune_telegram"]));
  });

  it("збій звірки дає 500, але решта кроків виконана", async () => {
    fail.step = "sweep";
    const response = await tick();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ failed: ["sweep"] });
    expect(calls).toEqual(expect.arrayContaining(["post", "close", "prune_telegram"]));
  });

  it("прибирання за строком зберігання йде раз на добу, у вікні після 03:00 UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.UTC(2026, 10, 14, 12, 0));
      await tick();
      expect(calls).not.toContain("purge_requisites");
      vi.setSystemTime(Date.UTC(2026, 10, 14, 3, 2));
      const response = await tick();
      expect(calls).toContain("purge_requisites");
      expect(await response.json()).toMatchObject({ purged: 2 });
      fail.step = "purge_requisites";
      calls.length = 0;
      expect(await (await tick()).json()).toMatchObject({ ok: false, failed: ["purge_requisites"] });
      expect(calls).toEqual(expect.arrayContaining(["sweep", "prune_telegram"]));
    } finally {
      vi.useRealTimers();
    }
  });

  it("прибирання сесій, кодів і фото чату: кожен крок окремо, збій одного не чіпає решту", async () => {
    expect(await (await tick()).json()).toMatchObject({ ok: true, pruned: { sessions: 3, emailCodes: 2, releaseCodes: 1, chatPhotos: 4 } });
    for (const name of ["prune_sessions", "prune_email_codes", "prune_release_codes", "prune_chat_photos"]) {
      fail.step = name;
      calls.length = 0;
      const response = await tick();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: false, failed: [name] });
      expect(calls).toEqual(expect.arrayContaining(["sweep", "post", "prune_sessions", "prune_email_codes", "prune_release_codes", "prune_chat_photos"]));
    }
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
