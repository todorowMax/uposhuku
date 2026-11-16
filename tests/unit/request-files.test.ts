// Файли запиту в R2 (lib/server/request-files.ts, app/api/request-files, lib/requests/file-types.ts):
// завантаження й ліміти, тип за вмістом, доступ (автор, виконавець, відгукнувся, гість), привʼязка до запиту,
// правка, чистка осиротілих. D1 і R2 у пам'яті, як у сусідніх тестах.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string | null } | null }));
vi.mock("@/lib/server/auth", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@/lib/server/auth")), getSessionUser: async () => session.user }));
vi.mock("@/lib/server/realtime", () => ({ pushGlobal: vi.fn(), pushUser: vi.fn() }));
vi.mock("@/lib/server/notify", () => ({ notifyLater: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/server/notify-matching", () => ({ notifyMatchingPerformers: vi.fn() }));
vi.mock("@/lib/telemetry/log", () => ({ logServer: vi.fn(), logServerError: vi.fn(), serverEvent: vi.fn() }));

import { eq } from "drizzle-orm";
import { DELETE, GET } from "@/app/api/request-files/[id]/route";
import { POST as upload } from "@/app/api/request-files/route";
import { PATCH } from "@/app/api/requests/[id]/route";
import { POST as publish } from "@/app/api/requests/route";
import { requestFiles } from "@/db/schema";
import { feedPage, mapRequests } from "@/lib/feed/feed";
import { REQUEST_FILES_MAX, REQUEST_FILES_PENDING_MAX, REQUEST_FILES_TOTAL_BYTES, REQUEST_FILE_MAX_BYTES, REQUEST_FILE_ORPHAN_MS, detectRequestFile, sanitizeFileName } from "@/lib/requests/file-types";
import { parseDraft } from "@/lib/requests/parse-draft";
import type { PublishedRequest } from "@/lib/requests/types";
import { getDb } from "@/lib/server/db";
import { readableRequestFile, saveRequestFile } from "@/lib/server/request-files";
import { closeRequest, createRequest, getPublicRequest, saveResponse } from "@/lib/server/request-repo";
import { pruneOrphanRequestFiles } from "@/lib/server/tick-cleanup";
import { getBucket } from "@/lib/server/uploads";
import { jsonRequest, ctxOf, publishProfile } from "../helpers/route-fixtures";
import { makeUser, useTestD1 } from "../helpers/d1";
import { PDF_BYTES, PNG_BYTES, attach, textBytes } from "../helpers/request-file-fixtures";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const as = (id: string | null) => {
  session.user = id ? { id, email: `${id}@example.com`, name: null } : null;
};
const upRequest = (name: string, bytes: Uint8Array, headers: Record<string, string> = {}) =>
  new Request("https://findlyfy.test/api/request-files", { method: "POST", body: bytes.slice(), headers: { "x-file-name": encodeURIComponent(name), ...headers } });
const get = (id: string | number) => GET(new Request("https://findlyfy.test/api/request-files/x"), ctxOf({ id: String(id) }));
const remove = (id: string | number) => DELETE(new Request("https://findlyfy.test/api/request-files/x", { method: "DELETE" }), ctxOf({ id: String(id) }));
const keysIn = async () => (await getBucket().list({ prefix: "requests/" })).objects.map((object) => object.key);
const keyOf = async (id: number) => (await getDb().select({ key: requestFiles.key }).from(requestFiles).where(eq(requestFiles.id, id)))[0]?.key ?? null;
const draft = (files: { id: number }[], text = "Потрібен Telegram-бот для запису клієнтів") => ({ text, tags: [], files });

beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["rf-author", "rf-other", "rf-perf", "rf-noprofile", "rf-responder", "rf-cap", "rf-stale", "rf-big"]) await makeUser(ctx.db, id);
  for (const id of ["rf-perf", "rf-responder"]) await publishProfile(id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(() => as("rf-author"));

describe("тип файла визначається за розширенням і вмістом", () => {
  it("приймає pdf, png, текст і код; відхиляє виконувані, svg, html і підміну розширення", () => {
    expect(detectRequestFile("brief.pdf", PDF_BYTES)).toMatchObject({ mime: "application/pdf", kind: "document" });
    expect(detectRequestFile("logo.png", PNG_BYTES)).toMatchObject({ mime: "image/png", kind: "image" });
    expect(detectRequestFile("main.py", textBytes("print('привіт')"))).toMatchObject({ mime: "text/plain; charset=utf-8", kind: "text" });
    expect(detectRequestFile("virus.exe", PDF_BYTES)).toBeNull();
    expect(detectRequestFile("pic.svg", textBytes("<svg onload='alert(1)'/>"))).toBeNull();
    expect(detectRequestFile("page.html", textBytes("<script>alert(1)</script>"))).toBeNull();
    // Розширення каже jpg, а всередині pdf або png: не довіряємо імені.
    expect(detectRequestFile("photo.jpg", PDF_BYTES)).toBeNull();
    expect(detectRequestFile("report.pdf", PNG_BYTES)).toBeNull();
    // «Текст» з нульовим байтом чи пошкодженим UTF-8 це не текст.
    expect(detectRequestFile("data.txt", new Uint8Array([0x61, 0x00, 0x62]))).toBeNull();
    expect(detectRequestFile("data.txt", new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
  });

  it("ім'я для показу без шляху й керівних символів, не довге", () => {
    expect(sanitizeFileName("C:\\Users\\Anna\\brief.pdf")).toBe("brief.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("a\u0000b\nc<d>.txt")).toBe("abcd.txt");
    expect(sanitizeFileName("   ")).toBe("файл");
    expect(sanitizeFileName(`${"а".repeat(300)}.pdf`)).toHaveLength(120);
    expect(sanitizeFileName(`${"а".repeat(300)}.pdf`).endsWith(".pdf")).toBe(true);
  });
});

describe("POST /api/request-files", () => {
  it("кладе файл у R2 під ключем без імені людини, тип бере з вмісту, а не з Content-Type", async () => {
    const response = await upload(upRequest("Бриф.pdf", PDF_BYTES, { "content-type": "text/html" }));
    expect(response.status).toBe(201);
    const { file } = (await response.json()) as { file: { id: number; name: string; size: number; type: string; stored: boolean } };
    expect(file).toMatchObject({ name: "Бриф.pdf", size: PDF_BYTES.length, type: "application/pdf", stored: true });
    const key = await keyOf(file.id);
    expect(key).toMatch(/^requests\/[0-9a-f-]{36}\.pdf$/);
    expect(key).not.toContain("rf-author");
    expect((await getBucket().head(key ?? ""))?.httpMetadata?.contentType).toBe("application/pdf");
  });

  it("гість отримує 401, нічого не лягає в R2", async () => {
    as(null);
    const before = (await keysIn()).length;
    expect((await upload(upRequest("a.pdf", PDF_BYTES))).status).toBe(401);
    expect(await keysIn()).toHaveLength(before);
  });

  it("відмовляє: порожній файл, невідомий тип, підміна розширення, завеликий (413)", async () => {
    const before = (await keysIn()).length;
    expect((await upload(upRequest("a.pdf", new Uint8Array(0)))).status).toBe(400);
    expect((await upload(upRequest("run.exe", PDF_BYTES))).status).toBe(400);
    expect((await upload(upRequest("photo.jpg", PDF_BYTES))).status).toBe(400);
    expect((await upload(upRequest("big.pdf", new Uint8Array(REQUEST_FILE_MAX_BYTES + 1)))).status).toBe(413);
    expect(await keysIn()).toHaveLength(before);
  });

  it("не більше REQUEST_FILES_PENDING_MAX файлів без запиту; старші за добу прибираються самі", async () => {
    const day = REQUEST_FILE_ORPHAN_MS;
    const now = Date.now();
    for (let index = 0; index < REQUEST_FILES_PENDING_MAX; index++) expect(typeof (await saveRequestFile("rf-cap", { name: `f${index}.txt`, bytes: textBytes("x") }, now))).toBe("object");
    expect(await saveRequestFile("rf-cap", { name: "extra.txt", bytes: textBytes("x") }, now)).toMatch(/Забагато файлів/);
    // Через добу й секунду старі вважаються осиротілими, місце звільняється й їхні байти зникають з R2.
    const staleKeys = (await getDb().select({ key: requestFiles.key }).from(requestFiles).where(eq(requestFiles.uploaderUserId, "rf-cap"))).map((row) => row.key ?? "");
    expect(typeof (await saveRequestFile("rf-cap", { name: "fresh.txt", bytes: textBytes("x") }, now + day + 1000))).toBe("object");
    for (const key of staleKeys) expect(await getBucket().head(key)).toBeNull();
    expect(await getDb().select().from(requestFiles).where(eq(requestFiles.uploaderUserId, "rf-cap"))).toHaveLength(1);
  });
});

describe("привʼязка файлів до запиту", () => {
  it("публікація забирає свої завантажені файли; чужий, уже зайнятий і неіснуючий id дають 400, запиту не створюють", async () => {
    const mine = await attach("rf-author", "brief.pdf", PDF_BYTES);
    const foreign = await attach("rf-other", "foreign.pdf", PDF_BYTES);
    const created = (await (await publish(jsonRequest("POST", draft([{ id: mine.id }])))).json()) as { request: PublishedRequest };
    expect(created.request.files).toEqual([{ id: mine.id, name: "brief.pdf", size: PDF_BYTES.length, type: "application/pdf", stored: true }]);
    expect((await getDb().select().from(requestFiles).where(eq(requestFiles.id, mine.id)))[0].requestId).toBe(created.request.id);

    const rejected = [foreign.id, mine.id, 999_999];
    for (const id of rejected) {
      const response = await publish(jsonRequest("POST", draft([{ id }], `Ще один запит на файл ${id}`)));
      expect(response.status).toBe(400);
    }
    expect((await getDb().select().from(requestFiles).where(eq(requestFiles.id, foreign.id)))[0].requestId).toBeNull();
  });

  it("файли разом важчі за стелю: 400", async () => {
    const a = await attach("rf-big", "a.pdf", PDF_BYTES);
    const b = await attach("rf-big", "b.pdf", PDF_BYTES);
    await getDb().update(requestFiles).set({ size: REQUEST_FILES_TOTAL_BYTES / 2 + 1 }).where(eq(requestFiles.uploaderUserId, "rf-big"));
    as("rf-big");
    const response = await publish(jsonRequest("POST", draft([{ id: a.id }, { id: b.id }])));
    expect(response.status).toBe(400);
  });

  it("правка: знятий файл зникає з бази й R2, лишений і новий на місці; запит без файлів правиться як раніше", async () => {
    const keep = await attach("rf-author", "keep.txt", textBytes("лишається"));
    const drop = await attach("rf-author", "drop.txt", textBytes("зникне"));
    const created = ((await (await publish(jsonRequest("POST", draft([{ id: keep.id }, { id: drop.id }], "Запит для правки файлів")))).json()) as { request: PublishedRequest }).request;
    const dropKey = await keyOf(drop.id);
    const added = await attach("rf-author", "new.pdf", PDF_BYTES);
    const patched = await PATCH(jsonRequest("PATCH", draft([{ id: keep.id }, { id: added.id }], "Запит для правки файлів")), ctxOf({ id: created.id }));
    expect(patched.status).toBe(200);
    const after = ((await patched.json()) as { request: PublishedRequest }).request;
    expect(after.files.map((file) => file.name)).toEqual(["keep.txt", "new.pdf"]);
    expect(await getDb().select().from(requestFiles).where(eq(requestFiles.id, drop.id))).toEqual([]);
    expect(await getBucket().head(dropKey ?? "")).toBeNull();
    // Чужий файл у правці відхиляється, запит не змінюється.
    const foreign = await attach("rf-other", "x.pdf", PDF_BYTES);
    expect((await PATCH(jsonRequest("PATCH", draft([{ id: foreign.id }], "Запит для правки файлів")), ctxOf({ id: created.id }))).status).toBe(400);
    // Знімаємо всі файли.
    const cleared = ((await (await PATCH(jsonRequest("PATCH", draft([], "Запит для правки файлів")), ctxOf({ id: created.id }))).json()) as { request: PublishedRequest }).request;
    expect(cleared.files).toEqual([]);
    expect(await getBucket().head((await keyOf(keep.id)) ?? "")).toBeNull();
  });
});

describe("доступ до файлу", () => {
  let request: PublishedRequest;
  let pdf: number;
  let png: number;
  beforeAll(async () => {
    const a = await attach("rf-author", "brief.pdf", PDF_BYTES);
    const b = await attach("rf-author", "logo.png", PNG_BYTES);
    pdf = a.id;
    png = b.id;
    request = await createRequest("rf-author", { text: "Потрібен сайт з логотипом", tags: [], files: [{ id: a.id }, { id: b.id }] });
  });

  it("автор і виконавець з опублікованим профілем відкривають; pdf іде на завантаження, зображення вбудовано, nosniff", async () => {
    for (const who of ["rf-author", "rf-perf"]) {
      as(who);
      const response = await get(pdf);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="brief\.pdf"/);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cache-control")).toMatch(/private/);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
    }
    expect((await get(png)).headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("гість: 401; увійшов без опублікованого профілю: 404, ніби файла нема; неправильний id: 404", async () => {
    as(null);
    expect((await get(pdf)).status).toBe(401);
    as("rf-noprofile");
    expect((await get(pdf)).status).toBe(404);
    as("rf-perf");
    for (const id of ["0", "abc", "-1", "99999999999999", "1.5"]) expect((await get(id)).status).toBe(404);
  });

  it("публічна сторінка запиту файлів не віддає ні гостю, ні виконавцю", async () => {
    for (const viewer of [null, "rf-perf", "rf-author"]) expect(JSON.stringify(await getPublicRequest(request.id, viewer))).not.toContain("brief.pdf");
  });

  it("стрічка й карта несуть список файлів виконавцю", async () => {
    const page = await feedPage("rf-perf", { viewer: { tags: [], cityId: null } });
    expect(page.items.find((item) => item.id === request.id)?.files?.map((file) => file.name)).toEqual(["brief.pdf", "logo.png"]);
    const map = await mapRequests("rf-perf", { tags: [], cityId: null });
    expect(map.find((item) => item.id === request.id)?.files?.map((file) => file.name)).toEqual(["brief.pdf", "logo.png"]);
  });

  it("закритий запит: стороннім виконавцям 404, а хто відгукнувся, файл і далі бачить", async () => {
    const closing = await createRequest("rf-author", { text: "Закриємо цей запит із файлом", tags: [], files: [{ id: (await attach("rf-author", "close.pdf", PDF_BYTES)).id }] });
    await saveResponse("rf-responder", closing.id, { price: 100, days: 3, message: "Зроблю" });
    const fileId = closing.files[0].id;
    as("rf-perf");
    expect((await get(fileId)).status).toBe(200);
    await closeRequest("rf-author", closing.id);
    expect((await get(fileId)).status).toBe(404);
    as("rf-responder");
    expect((await get(fileId)).status).toBe(200);
    as("rf-author");
    expect((await get(fileId)).status).toBe(200);
  });

  it("завантажений, але не доданий до запиту файл бачить лише той, хто його завантажив", async () => {
    const pending = await attach("rf-author", "pending.txt", textBytes("чернетка"));
    expect(await readableRequestFile("rf-author", pending.id)).not.toBeNull();
    for (const who of ["rf-perf", "rf-other", "rf-responder"]) expect(await readableRequestFile(who, pending.id)).toBeNull();
  });
});

describe("DELETE /api/request-files/:id і чистка осиротілих", () => {
  it("прибирає лише свій файл, ще не доданий до запиту: байти зникають з R2", async () => {
    const pending = await attach("rf-author", "tmp.txt", textBytes("тимчасовий"));
    const key = (await keyOf(pending.id)) ?? "";
    as("rf-other");
    expect((await remove(pending.id)).status).toBe(404);
    expect(await getBucket().head(key)).not.toBeNull();
    as("rf-author");
    expect((await remove(pending.id)).status).toBe(204);
    expect(await getBucket().head(key)).toBeNull();
    expect((await remove(pending.id)).status).toBe(404);
    // Файл збереженого запиту через DELETE не видаляється: це робить правка запиту.
    const attached = await createRequest("rf-author", { text: "Запит із файлом, який не можна видалити напряму", tags: [], files: [{ id: (await attach("rf-author", "stay.txt", textBytes("лишається"))).id }] });
    expect((await remove(attached.files[0].id)).status).toBe(404);
    expect(await getDb().select().from(requestFiles).where(eq(requestFiles.id, attached.files[0].id))).toHaveLength(1);
  });

  it("tick: осиротілі старші за добу зникають з R2 і бази, свіжі й прикріплені лишаються", async () => {
    const now = Date.now();
    const old = await saveRequestFile("rf-stale", { name: "old.txt", bytes: textBytes("старий") }, now - REQUEST_FILE_ORPHAN_MS - 1000);
    const fresh = await saveRequestFile("rf-stale", { name: "fresh.txt", bytes: textBytes("свіжий") }, now - 1000);
    const attachedOld = await saveRequestFile("rf-stale", { name: "attached.txt", bytes: textBytes("прикріплений") }, now - REQUEST_FILE_ORPHAN_MS - 1000);
    if (typeof old === "string" || typeof fresh === "string" || typeof attachedOld === "string") throw new Error("файли не створені");
    await createRequest("rf-stale", { text: "Запит із давнім файлом", tags: [], files: [{ id: attachedOld.id }] });
    const oldKey = (await keyOf(old.id)) ?? "";
    expect(await pruneOrphanRequestFiles(now)).toBe(1);
    expect(await getDb().select().from(requestFiles).where(eq(requestFiles.id, old.id))).toEqual([]);
    expect(await getBucket().head(oldKey)).toBeNull();
    expect(await getDb().select().from(requestFiles).where(eq(requestFiles.id, fresh.id))).toHaveLength(1);
    expect(await getDb().select().from(requestFiles).where(eq(requestFiles.id, attachedOld.id))).toHaveLength(1);
    expect(await pruneOrphanRequestFiles(now)).toBe(0);
  });
});

describe("parseDraft: файли в чернетці", () => {
  const parse = (files: unknown[]) => parseDraft({ text: "Потрібен сайт для кав'ярні", files }, { now: new Date() });

  it("лишає тільки додатні цілі id без дублів, імена й розміри з клієнта ігнорує, не більше десяти", () => {
    const draft = parse([{ id: 1, name: "x.pdf", size: 5 }, { id: 1 }, { id: -3 }, { id: "2" }, { id: 1.5 }, { id: 0 }, null, { name: "без id" }, { id: 7 }]);
    expect(typeof draft === "string" ? draft : draft.files).toEqual([{ id: 1 }, { id: 7 }]);
    const many = parse(Array.from({ length: 30 }, (_, index) => ({ id: index + 1 })));
    expect(typeof many === "string" ? [] : many.files).toHaveLength(REQUEST_FILES_MAX);
  });
});
