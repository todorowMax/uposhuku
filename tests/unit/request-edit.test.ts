import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/notify-matching", () => ({ notifyMatchingPerformers: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { PATCH } from "@/app/api/requests/[id]/route";
import { POST } from "@/app/api/requests/route";
import { requestFiles, requestTags, requests } from "@/db/schema";
import { conversations } from "@/db/schema";
import type { PublishedRequest } from "@/lib/requests/types";
import { REQUEST_EDITED_NOTICE, REQUEST_EDITED_NOTICE_WINDOW_MS, addSystemMessage, getOrCreateConversation, listMessages, noteRequestEdited } from "@/lib/server/chat-repo";
import { pushGlobal } from "@/lib/server/realtime";
import { notifyMatchingPerformers } from "@/lib/server/notify-matching";
import { getDb } from "@/lib/server/db";
import { findRequest, saveResponse, updateRequest } from "@/lib/server/request-repo";
import { exhaust, jsonRequest, openRequest, ctxOf } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
const body = async (response: Response) => (await response.json()) as { request: PublishedRequest; title?: string; detail?: string; type?: string };
const edit = (id: string, payload: Record<string, unknown>) => PATCH(jsonRequest("PATCH", payload), ctxOf({ id }));

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["re-cust", "re-other", "re-perf", "re-perf2", "re-lurker"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => {
  as("re-cust");
  vi.mocked(pushGlobal).mockClear();
});

const draft = { text: "Потрібен Telegram-бот для запису клієнтів", budget: 5000, deadline: "week", cityId: "lviv", channelOptIn: true, tags: [{ id: "telegram-bot", label: "Telegram-бот" }], files: [{ name: "brief.pdf", size: 1200, type: "application/pdf" }] };

describe("PATCH /api/requests/:id: правка", () => {
  it("автор змінює текст, умови, теги, файли й галочку каналу; createdAt і порядок не змінюються", async () => {
    const created = await body(await POST(jsonRequest("POST", draft)));
    const before = created.request;
    expect(before).toMatchObject({ editedAt: null, channelOptIn: true });
    const response = await edit(before.id, {
      text: "Потрібен сайт-візитка для майстерні",
      budget: 12000,
      deadline: "month",
      cityId: "kyiv",
      channelOptIn: false,
      tags: [{ id: "website", label: "Сайт" }],
      files: [{ name: "logo.png", size: 900, type: "image/png" }, { name: "text.docx", size: 400, type: "" }],
    });
    expect(response.status).toBe(200);
    const after = (await body(response)).request;
    expect(after).toMatchObject({ id: before.id, text: "Потрібен сайт-візитка для майстерні", budget: 12000, deadline: "month", cityId: "kyiv", channelOptIn: false, status: "open", createdAt: before.createdAt });
    expect(after.tags.map((tag) => tag.id)).toContain("website");
    expect(after.tags.map((tag) => tag.id)).not.toContain("telegram-bot");
    expect(after.files.map((file) => file.name)).toEqual(["logo.png", "text.docx"]);
    expect(after.editedAt).not.toBeNull();
    const [row] = await getDb().select().from(requests).where(eq(requests.id, before.id));
    expect(row.editCount).toBe(1);
    expect(row.createdAt).toBe(Date.parse(before.createdAt));
    expect(await getDb().select().from(requestTags).where(eq(requestTags.requestId, before.id))).not.toHaveLength(0);
    expect(await getDb().select().from(requestFiles).where(eq(requestFiles.requestId, before.id))).toHaveLength(2);
    expect(pushGlobal).toHaveBeenCalledWith({ t: "feed" });
    // Друга правка рахується, файли можна прибрати зовсім.
    const again = (await body(await edit(before.id, { ...draft, text: "Потрібен сайт-візитка, ще раз", files: [] }))).request;
    expect(again.files).toEqual([]);
    expect((await getDb().select().from(requests).where(eq(requests.id, before.id)))[0].editCount).toBe(2);
  });

  it("теги пересчитуються: порожні добираються з нового тексту, зайве відкидається", async () => {
    const own = await openRequest("re-cust", "Потрібен Telegram-бот для запису клієнтів");
    const edited = (await body(await edit(own.id, { text: "Потрібен інтернет-магазин кераміки з кошиком", tags: [] }))).request;
    expect(edited.tags.length).toBeGreaterThan(0);
    expect(edited.tags.map((tag) => tag.id)).not.toContain("telegram-bot");
    const dup = (await body(await edit(own.id, { text: "Потрібен інтернет-магазин кераміки", tags: [{ id: "online-store", label: "Інтернет-магазин" }, { id: "online-store", label: "Інтернет-магазин" }] }))).request;
    expect(dup.tags.filter((tag) => tag.id === "online-store")).toHaveLength(1);
  });

  it("невалідне тіло дає 400 і нічого не змінює", async () => {
    const own = await openRequest("re-cust", "Початковий опис запиту");
    for (const payload of [{ text: "" }, { text: "ab" }, { text: "а".repeat(4001) }, { budget: 5000 }]) {
      expect((await edit(own.id, payload)).status, JSON.stringify(payload)).toBe(400);
    }
    const [row] = await getDb().select().from(requests).where(eq(requests.id, own.id));
    expect(row).toMatchObject({ text: "Початковий опис запиту", editCount: 0, editedAt: null });
  });

  it("гість 401; чужий і неіснуючий 404 без змін; закритий 409 без змін", async () => {
    const own = await openRequest("re-cust", "Початковий опис запиту");
    as(null);
    expect((await edit(own.id, draft)).status).toBe(401);
    as("re-other");
    expect((await edit(own.id, draft)).status).toBe(404);
    as("re-cust");
    expect((await edit("req_nope", draft)).status).toBe(404);
    expect((await findRequest("re-cust", own.id))?.text).toBe("Початковий опис запиту");
    await PATCH(jsonRequest("PATCH", { status: "closed" }), ctxOf({ id: own.id }));
    const closed = await edit(own.id, draft);
    expect(closed.status).toBe(409);
    expect((await body(closed)).detail).toBe("Запит закрито, його не можна змінити.");
    expect(await updateRequest("re-cust", own.id, { ...draft, deadline: "week", tags: [], files: [] })).toBe("closed");
    expect((await findRequest("re-cust", own.id))?.text).toBe("Початковий опис запиту");
  });

  it("21-ша правка за годину дає 429 і не змінює запит", async () => {
    await makeUser(ctx.db, "re-spammer");
    as("re-spammer");
    const own = await openRequest("re-spammer", "Початковий опис запиту");
    await exhaust("requestEdit", "re-spammer");
    const response = await edit(own.id, draft);
    expect(response.status).toBe(429);
    expect((await body(response)).type).toBe("/problems/rate-limited");
    expect((await findRequest("re-spammer", own.id))?.text).toBe("Початковий опис запиту");
  });

  it("правка не шле сповіщень «новий запит під ваші теги»", async () => {
    const own = await openRequest("re-cust", "Початковий опис запиту");
    vi.mocked(notifyMatchingPerformers).mockClear();
    expect((await edit(own.id, draft)).status).toBe(200);
    expect(notifyMatchingPerformers).not.toHaveBeenCalled();
  });
});

describe("службовий рядок після правки", () => {
  const notices = async (conversationId: string) => (await listMessages(conversationId)).filter((message) => message.kind === "system" && message.text === REQUEST_EDITED_NOTICE);

  it("лише в розмови з тими, хто відгукнувся на цей запит; розмов не створює; раз на 10 хвилин", async () => {
    const own = await openRequest("re-cust", "Початковий опис запиту");
    const other = await openRequest("re-cust", "Інший запит замовника");
    await saveResponse("re-perf", own.id, { price: 1000, days: 3, message: "Зроблю за три дні." });
    await saveResponse("re-perf2", own.id, { price: 1200, days: 4, message: "Зроблю за чотири дні." });
    await saveResponse("re-lurker", other.id, { price: 900, days: 2, message: "Це відгук на інший запит." });
    await addSystemMessage("re-cust", "re-perf", `Відгук на «${own.text}»`, own.id);
    await addSystemMessage("re-cust", "re-lurker", `Відгук на «${other.text}»`, other.id);
    // re-perf2 відгукнувся, але розмови ще немає.
    const talkOf = async (performer: string) => (await getOrCreateConversation("re-cust", `me-${performer}`, performer)).id;
    const perfTalk = await talkOf("re-perf");
    const lurkerTalk = await talkOf("re-lurker");
    const countBefore = (await getDb().select().from(conversations).where(eq(conversations.customerUserId, "re-cust"))).length;

    expect((await edit(own.id, { ...draft, text: "Оновлений опис запиту" })).status).toBe(200);
    expect(await notices(perfTalk)).toHaveLength(1);
    expect((await notices(perfTalk))[0].contextId).toBe(own.id);
    expect(await notices(lurkerTalk)).toHaveLength(0);
    expect((await getDb().select().from(conversations).where(eq(conversations.customerUserId, "re-cust"))).length).toBe(countBefore);

    // Серія правок поспіль: рядок не дублюється, у тексті рядка немає змін.
    await edit(own.id, { ...draft, text: "Оновлений опис запиту, версія 3" });
    expect(await notices(perfTalk)).toHaveLength(1);
    expect((await notices(perfTalk))[0].text).toBe("Замовник оновив запит");

    // Після вікна новий рядок з'являється.
    await noteRequestEdited("re-cust", own.id, Date.now() + REQUEST_EDITED_NOTICE_WINDOW_MS + 1000);
    expect(await notices(perfTalk)).toHaveLength(2);
  });
});
