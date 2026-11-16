import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { GET as GET_ATTACHMENT } from "@/app/api/conversations/[id]/attachments/[attachmentId]/route";
import { POST as UPLOAD_ATTACHMENT } from "@/app/api/conversations/[id]/attachments/route";
import { GET as GET_MESSAGES, POST as POST_MESSAGE } from "@/app/api/conversations/[id]/messages/route";
import { GET as LIST, POST as OPEN } from "@/app/api/conversations/route";
import { GET as PUBLIC_FILE } from "@/app/api/uploads/[...key]/route";
import { chatAttachments, messages } from "@/db/schema";
import { getOrCreateConversation, listMessages } from "@/lib/server/chat-repo";
import { getDb } from "@/lib/server/db";
import { CHAT_PHOTO_MAX_BYTES, getBucket } from "@/lib/server/uploads";
import { ctxOf, exhaust, jsonRequest, publishProfile } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
let convId = "";
let otherConvId = "";
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
const body = async (response: Response) => (await response.json()) as Record<string, unknown>;
const JPEG: Uint8Array<ArrayBuffer> = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const post = (bytes: Uint8Array<ArrayBuffer> | string) => new Request("https://findlyfy.test/x", { method: "POST", body: bytes, headers: { "content-type": "image/jpeg" } });
const get = () => new Request("https://findlyfy.test/x");

const sendPhoto = async (conversation: string) => (await body(await UPLOAD_ATTACHMENT(post(JPEG), ctxOf({ id: conversation })))) as { id: string; url: string };
const messageCount = async (conversation: string) => (await listMessages(conversation)).length;

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["ac-cust", "ac-perf", "ac-stranger", "ac-cust2", "ac-draft"]) await makeUser(ctx.db, id);
  await publishProfile("ac-perf");
  await publishProfile("ac-stranger");
  await publishProfile("ac-draft", { published: false });
  convId = (await getOrCreateConversation("ac-cust", "me-ac-perf", "ac-perf")).id;
  otherConvId = (await getOrCreateConversation("ac-cust2", "me-ac-stranger", "ac-stranger")).id;
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => as("ac-cust"));

describe("POST/GET /api/conversations", () => {
  it("без входу 401", async () => {
    as(null);
    expect((await LIST()).status).toBe(401);
    expect((await OPEN(jsonRequest("POST", { performerId: "me-ac-perf" }))).status).toBe(401);
  });

  it("розмову з собою, з неопублікованим профілем, з вигаданим id і без performerId відкрити не можна: 404", async () => {
    as("ac-perf");
    expect((await OPEN(jsonRequest("POST", { performerId: "me-ac-perf" }))).status).toBe(404);
    as("ac-cust");
    for (const payload of [{ performerId: "me-ac-draft" }, { performerId: "me-nobody" }, { performerId: "demo-1" }, {}, "{bad", { performerId: 7 }]) {
      expect((await OPEN(jsonRequest("POST", payload))).status, JSON.stringify(payload)).toBe(404);
    }
  });

  it("відкриває розмову й повертає ту саму вдруге", async () => {
    as("ac-cust2");
    const first = await OPEN(jsonRequest("POST", { performerId: "me-ac-perf" }));
    expect(first.status).toBe(201);
    const second = await OPEN(jsonRequest("POST", { performerId: "me-ac-perf" }));
    expect(((await body(first)).conversation as { id: string }).id).toBe(((await body(second)).conversation as { id: string }).id);
  });

  it("список лише власних розмов: чужа не видна", async () => {
    as("ac-cust");
    const mine = (await body(await LIST())).conversations as { id: string }[];
    expect(mine.map((item) => item.id)).toContain(convId);
    expect(mine.map((item) => item.id)).not.toContain(otherConvId);
  });

  it("31-ша нова розмова за годину дає 429", async () => {
    as("ac-limited");
    await makeUser(ctx.db, "ac-limited");
    await exhaust("conversationCreate", "ac-limited");
    expect((await OPEN(jsonRequest("POST", { performerId: "me-ac-perf" }))).status).toBe(429);
  });

  it("пошта замовника без імені виконавцю не показується", async () => {
    as("ac-perf");
    const list = await LIST();
    const raw = JSON.stringify(await body(list));
    expect(raw).toContain("Замовник");
    expect(raw).not.toContain("ac-cust@example.com");
  });
});

describe("/api/conversations/:id/messages", () => {
  it("без входу 401", async () => {
    as(null);
    expect((await GET_MESSAGES(get(), ctxOf({ id: convId }))).status).toBe(401);
    expect((await POST_MESSAGE(jsonRequest("POST", { text: "привіт" }), ctxOf({ id: convId }))).status).toBe(401);
  });

  it("учасники пишуть і читають: замовник і виконавець", async () => {
    expect((await POST_MESSAGE(jsonRequest("POST", { text: "Добрий день" }), ctxOf({ id: convId }))).status).toBe(201);
    as("ac-perf");
    expect((await POST_MESSAGE(jsonRequest("POST", { text: "Вітаю" }), ctxOf({ id: convId }))).status).toBe(201);
    const read = await body(await GET_MESSAGES(get(), ctxOf({ id: convId })));
    expect(read.role).toBe("performer");
    expect((read.messages as { text: string }[]).map((message) => message.text)).toEqual(expect.arrayContaining(["Добрий день", "Вітаю"]));
  });

  it("?before віддає старіші за курсор і hasMore; зламаний курсор 400, чужа людина 404", async () => {
    const all = (await body(await GET_MESSAGES(get(), ctxOf({ id: convId })))) as { messages: { id: string; at: string }[]; hasMore: boolean };
    expect(all.hasMore).toBe(false);
    expect(all.messages.length).toBeGreaterThanOrEqual(2);
    const last = all.messages.at(-1) as { id: string; at: string };
    const before = (cursor: string, user = "ac-cust") => {
      as(user);
      return GET_MESSAGES(new Request(`https://findlyfy.test/x?before=${encodeURIComponent(cursor)}`), ctxOf({ id: convId }));
    };
    const older = await body(await before(`${Date.parse(last.at)}:${last.id}`));
    expect((older.messages as { id: string }[]).map((message) => message.id)).toEqual(all.messages.slice(0, -1).map((message) => message.id));
    expect(older.hasMore).toBe(false);
    for (const bad of ["abc", "123", "x:y", ":id", "12:", "12:a b"]) expect((await before(bad)).status).toBe(400);
    expect((await before(`${Date.parse(last.at)}:${last.id}`, "ac-stranger")).status).toBe(404);
  });

  it("чужа переписка: стороння людина не читає (404) і не пише (404), повідомлення не з'являється", async () => {
    const before = await messageCount(convId);
    as("ac-stranger");
    const read = await GET_MESSAGES(get(), ctxOf({ id: convId }));
    expect(read.status).toBe(404);
    expect(JSON.stringify(await body(read))).not.toContain("Добрий день");
    expect((await POST_MESSAGE(jsonRequest("POST", { text: "Я чужий" }), ctxOf({ id: convId }))).status).toBe(404);
    expect(await messageCount(convId)).toBe(before);
    expect((await GET_MESSAGES(get(), ctxOf({ id: "conv_nope" }))).status).toBe(404);
  });

  it("порожнє повідомлення і зламане тіло дають 400", async () => {
    for (const payload of ["{bad", {}, { text: "   " }, { text: 5 }, { attachmentIds: [] }]) {
      expect((await POST_MESSAGE(jsonRequest("POST", payload), ctxOf({ id: convId }))).status, JSON.stringify(payload)).toBe(400);
    }
  });

  it("чуже фото до повідомлення не прикріпити: ні з іншої розмови, ні завантажене іншою людиною", async () => {
    // Фото, завантажене виконавцем у цій же розмові, замовник приєднати не може.
    as("ac-perf");
    const performerPhoto = await sendPhoto(convId);
    // Фото з чужої розмови.
    as("ac-stranger");
    const foreignPhoto = await sendPhoto(otherConvId);
    as("ac-cust");
    const response = await POST_MESSAGE(jsonRequest("POST", { text: "З фото", attachmentIds: [performerPhoto.id, foreignPhoto.id] }), ctxOf({ id: convId }));
    expect(response.status).toBe(201);
    expect((await body(response)).message).not.toHaveProperty("attachments");
    for (const photo of [performerPhoto, foreignPhoto]) {
      const [row] = await getDb().select().from(chatAttachments).where(eq(chatAttachments.id, photo.id));
      expect(row.messageId).toBeNull();
    }
    // Лише фото без тексту: прикріпити нічого, тож повідомлення порожнє.
    const empty = await POST_MESSAGE(jsonRequest("POST", { attachmentIds: [performerPhoto.id] }), ctxOf({ id: convId }));
    expect(empty.status).toBe(400);
  });

  it("61-ше повідомлення за хвилину дає 429 і нічого не пише", async () => {
    as("ac-cust");
    await exhaust("message", "ac-cust");
    const before = await messageCount(convId);
    expect((await POST_MESSAGE(jsonRequest("POST", { text: "Забагато" }), ctxOf({ id: convId }))).status).toBe(429);
    expect(await messageCount(convId)).toBe(before);
    expect((await getDb().select().from(messages).where(eq(messages.text, "Забагато")))).toHaveLength(0);
  });
});

describe("/api/conversations/:id/attachments", () => {
  it("без входу 401", async () => {
    as(null);
    expect((await UPLOAD_ATTACHMENT(post(JPEG), ctxOf({ id: convId }))).status).toBe(401);
    expect((await GET_ATTACHMENT(get(), ctxOf({ id: convId, attachmentId: "att_x" }))).status).toBe(401);
  });

  it("сторонній не завантажує фото в чужу розмову: 404", async () => {
    as("ac-stranger");
    expect((await UPLOAD_ATTACHMENT(post(JPEG), ctxOf({ id: convId }))).status).toBe(404);
  });

  it("не картинка й завелике відхиляються: 400 і 413", async () => {
    as("ac-perf");
    expect((await UPLOAD_ATTACHMENT(post("це не картинка, а текст"), ctxOf({ id: convId }))).status).toBe(400);
    expect((await UPLOAD_ATTACHMENT(post(new Uint8Array(CHAT_PHOTO_MAX_BYTES * 2 + 1)), ctxOf({ id: convId }))).status).toBe(413);
  });

  it("фото учасників бачать лише учасники, кеш приватний; чужому 404, у чужій розмові 404", async () => {
    as("ac-perf");
    const photo = await sendPhoto(convId);
    const own = await GET_ATTACHMENT(get(), ctxOf({ id: convId, attachmentId: photo.id }));
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(JPEG);
    as("ac-cust");
    expect((await GET_ATTACHMENT(get(), ctxOf({ id: convId, attachmentId: photo.id }))).status).toBe(200);

    as("ac-stranger");
    expect((await GET_ATTACHMENT(get(), ctxOf({ id: convId, attachmentId: photo.id }))).status).toBe(404);
    // Своя розмова, чужий id фото: розмова учасника не відкриває файли інших розмов.
    expect((await GET_ATTACHMENT(get(), ctxOf({ id: otherConvId, attachmentId: photo.id }))).status).toBe(404);
    as(null);
  });

  it("приватні ключі чату не віддає і публічний маршрут /api/uploads", async () => {
    const [row] = await getDb().select().from(chatAttachments).limit(1);
    expect(await getBucket().get(row.key)).not.toBeNull();
    const key = row.key.split("/");
    expect((await PUBLIC_FILE(get(), ctxOf({ key } as never))).status).toBe(404);
  });

  it("31-ше фото за 10 хвилин дає 429", async () => {
    as("ac-cust");
    await exhaust("upload", "ac-cust");
    expect((await UPLOAD_ATTACHMENT(post(JPEG), ctxOf({ id: convId }))).status).toBe(429);
  });
});
