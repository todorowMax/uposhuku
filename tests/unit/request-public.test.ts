import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { requests } from "@/db/schema";
import { requestDescription, requestTitle } from "@/lib/requests/public";
import { getDb } from "@/lib/server/db";
import {
  closeRequest,
  createRequest,
  getPublicRequest,
  saveResponse,
} from "@/lib/server/request-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["pb-author", "pb-viewer", "pb-perf"])
    await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});

const publish = (over: { channelOptIn?: boolean; text?: string } = {}) =>
  createRequest("pb-author", {
    text:
      over.text ??
      "Потрібен сайт для кав'ярні. Телефон +380 67 123 45 67, пошта kava@example.com, @barista_lviv.",
    budget: 5000,
    deadline: "week",
    cityId: "lviv",
    tags: [{ id: "website", label: "Сайт" }],
    files: [{ name: "brief.pdf", size: 1200, type: "application/pdf" }],
    channelOptIn: over.channelOptIn,
  });

describe("публічний запит", () => {
  it("віддає лише публічні поля: без id автора, імені, пошти й файлів, текст без контактів", async () => {
    const created = await publish();
    const result = await getPublicRequest(created.id, null);
    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {}).sort()).toEqual(
      [
        "budget",
        "createdAt",
        "cityId",
        "deadline",
        "deadlineDate",
        "id",
        "own",
        "responseCount",
        "shared",
        "status",
        "tags",
        "text",
      ].sort(),
    );
    const json = JSON.stringify(result);
    for (const secret of [
      "pb-author",
      "example.com",
      "380 67",
      "barista_lviv",
      "brief.pdf",
      "files",
      "userId",
    ])
      expect(json).not.toContain(secret);
    expect(result?.text).toContain("[контакт приховано]");
    expect(result).toMatchObject({
      budget: 5000,
      deadline: "week",
      deadlineDate: null,
      cityId: "lviv",
      tags: [{ id: "website", label: "Сайт" }],
      status: "open",
      own: false,
      shared: true,
    });
  });

  it("своя дата терміну потрапляє на публічну сторінку", async () => {
    const created = await createRequest("pb-author", { text: "Потрібен сайт для пекарні", deadline: "month", deadlineDate: "2026-12-10", tags: [], files: [], channelOptIn: true });
    expect(await getPublicRequest(created.id, null)).toMatchObject({ deadline: "month", deadlineDate: "2026-12-10" });
  });

  it("рахує відгуки виконавців", async () => {
    const created = await publish();
    expect((await getPublicRequest(created.id, null))?.responseCount).toBe(0);
    await saveResponse("pb-perf", created.id, {
      price: 4000,
      days: 5,
      message: "Зроблю",
    });
    expect(
      (await getPublicRequest(created.id, "pb-viewer"))?.responseCount,
    ).toBe(1);
  });

  it("запит без дозволу автора й неіснуючий id дають null для всіх, крім автора", async () => {
    const hidden = await publish({ channelOptIn: false });
    expect(await getPublicRequest(hidden.id, null)).toBeNull();
    expect(await getPublicRequest(hidden.id, "pb-viewer")).toBeNull();
    expect(await getPublicRequest("req_unknown", null)).toBeNull();
    expect(await getPublicRequest("req_unknown", "pb-author")).toBeNull();
  });

  it("автор бачить свій запит і без дозволу, з позначкою own і shared: false", async () => {
    const hidden = await publish({ channelOptIn: false });
    const own = await getPublicRequest(hidden.id, "pb-author");
    expect(own).toMatchObject({ own: true, shared: false });
    expect(JSON.stringify(own)).not.toContain("pb-author");
  });

  it("закритий запит повертається зі статусом closed", async () => {
    const created = await publish();
    await closeRequest("pb-author", created.id);
    expect((await getPublicRequest(created.id, null))?.status).toBe("closed");
  });

  it("контакти вирізаються з тексту, збереженого в базі, а не лише при створенні", async () => {
    const created = await publish({
      text: "Лендинг, пишіть на t.me/someone або hello@site.ua",
    });
    await getDb()
      .update(requests)
      .set({ text: "Нова версія: телефон 0671234567 і https://evil.example/x" })
      .where(eq(requests.id, created.id));
    const text = (await getPublicRequest(created.id, null))?.text ?? "";
    expect(text).not.toMatch(/0671234567|evil\.example/);
  });
});

describe("заголовок і опис сторінки", () => {
  it("заголовок: перше речення, не довше 80 знаків", () => {
    expect(requestTitle("Потрібен сайт для кав'ярні. Бюджет обговоримо.")).toBe(
      "Потрібен сайт для кав'ярні.",
    );
    expect(requestTitle("Перший рядок\nДругий рядок")).toBe("Перший рядок");
    expect(requestTitle("слово ".repeat(40)).length).toBeLessThanOrEqual(81);
  });

  it("опис: перші 150 знаків", () => {
    const description = requestDescription("абвгд ".repeat(60));
    expect(description.length).toBeLessThanOrEqual(151);
    expect(description.endsWith("…")).toBe(true);
    expect(requestDescription("Коротко")).toBe("Коротко");
  });
});
