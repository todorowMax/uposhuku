import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyRequestFilter } from "@/lib/feed/map-requests";
import { addKyivDays } from "@/lib/requests/deadline-date";
import { feedPage, mapRequests, parseResponse, removeResponse, saveResponse } from "@/lib/feed/feed";
import { responsesFor } from "@/lib/requests/responses";
import { emptyProfile } from "@/lib/profile/types";
import { addPayment } from "@/lib/server/placement-repo";
import { saveProfile } from "@/lib/server/profile-repo";
import { createRequest, updateRequest } from "@/lib/server/request-repo";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { makeUser, useTestD1 } from "../helpers/d1";

/** Вся стрічка однією сторінкою: для перевірок, що не про сторінки. */
const feedFor = async (userId: string, tags: string[], cityId: string | null = null) => (await feedPage(userId, { viewer: { tags, cityId }, size: 1000 })).items;

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["cust-a", "cust-b", "perf-a", "perf-b", "nobody"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});

const bot = { text: "Потрібен Telegram-бот для запису клієнтів", tags: [{ id: "telegram-bot", label: "Telegram-бот" }, { id: "online-booking", label: "Онлайн-запис" }], files: [], cityId: "lviv" as const };
const store = { text: "Хочемо інтернет-магазин кераміки", tags: [{ id: "online-store", label: "Інтернет-магазин" }, { id: "cart-checkout", label: "Кошик" }], files: [], cityId: "kyiv" as const };

describe("стрічка запитів виконавця", () => {
  it("показує лише запити, що закривають хоч один тег профілю, чужі, найвідповідніші першими", async () => {
    const a = await createRequest("cust-a", bot);
    const b = await createRequest("cust-b", store);
    const items = await feedFor("perf-a", ["telegram-bot", "online-booking", "online-store"]);
    expect(items.map((item) => item.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(items.every((item) => item.matchedTags > 0)).toBe(true);
    expect(items.flatMap((item) => item.tags).every((tag) => TAGS_BY_ID.has(tag.id))).toBe(true);
    const counts = items.map((item) => item.matchedTags);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    // Без збігу запит теж у стрічці (з нулем збігів); свої запити виконавець у стрічці не бачить.
    expect((await feedFor("perf-a", ["branding"])).find((item) => item.id === a.id)?.matchedTags).toBe(0);
    expect((await feedFor("cust-a", ["telegram-bot"])).some((item) => item.id === a.id)).toBe(false);
  });

  it("запит зі своєю датою: у стрічці є deadlineDate, а підпис готового строку лишається, тож фільтр «Терміново» працює", async () => {
    const soon = await createRequest("cust-a", { ...bot, text: "Бот за два дні", deadline: "asap", deadlineDate: addKyivDays(new Date(), 2) });
    const far = await createRequest("cust-b", { ...store, text: "Магазин без поспіху", deadline: "flexible", deadlineDate: addKyivDays(new Date(), 90) });
    const plain = await createRequest("cust-b", { ...store, text: "Магазин без дати", deadline: "week" });
    const items = await feedFor("perf-a", ["telegram-bot"]);
    expect(items.find((item) => item.id === soon.id)).toMatchObject({ deadline: "Терміново, до 3 днів", deadlineDate: addKyivDays(new Date(), 2) });
    expect(items.find((item) => item.id === plain.id)).toMatchObject({ deadline: "Протягом тижня", deadlineDate: null });
    const urgent = applyRequestFilter(items, "urgent").map((item) => item.id);
    expect(urgent).toEqual(expect.arrayContaining([soon.id, plain.id]));
    expect(urgent).not.toContain(far.id);
  });

  it("відгук лишається в запиті, рахується й знімається", async () => {
    const request = await createRequest("cust-a", { ...bot, text: "Ще один бот для барбершопу" });
    const tags = ["telegram-bot"];
    const before = (await feedFor("perf-b", tags)).find((item) => item.id === request.id)!;
    expect(before).toMatchObject({ response: null, responses: 0 });
    await saveResponse("perf-b", request.id, { price: 9000, days: 7, message: "Добрий день, зроблю." });
    const after = (await feedFor("perf-b", tags)).find((item) => item.id === request.id)!;
    expect(after.response).toMatchObject({ price: 9000, days: 7 });
    expect(after.responses).toBe(1);
    await removeResponse("perf-b", request.id);
    expect((await feedFor("perf-b", tags)).find((item) => item.id === request.id)!.response).toBeNull();
  });
});

describe("хто може відгукнутися", () => {
  it("на будь-який відкритий чужий запит, навіть без збігу тегів; на свій, закритий чи неіснуючий не можна", async () => {
    const { canRespond } = await import("@/lib/feed/feed");
    const { closeRequest } = await import("@/lib/server/request-repo");
    const open = await createRequest("cust-a", { text: "Потрібен сайт для дорослого одягу", tags: [{ id: "website", label: "Сайт" }], files: [] });
    expect(await canRespond("perf-a", open.id)).toBe(true);
    // Збіг тегів профілю нічого не вирішує: стрічка теж показує запит, лише з нулем збігів.
    expect((await feedFor("perf-a", ["branding"])).find((item) => item.id === open.id)?.matchedTags).toBe(0);
    expect(await canRespond("cust-a", open.id)).toBe(false);
    expect(await canRespond("perf-a", "req_nope")).toBe(false);
    await closeRequest("cust-a", open.id);
    expect(await canRespond("perf-a", open.id)).toBe(false);
  });
});

describe("відгук виконавця: перевірка тіла", () => {
  const ok = { price: 12500, days: 14, message: "Добрий день! Зроблю, почну завтра." };

  it("приймає ціну числом або «після обговорення»", () => {
    expect(parseResponse(ok)).toMatchObject({ price: 12500, days: 14 });
    expect(parseResponse({ ...ok, price: null })).toMatchObject({ price: null });
  });

  it("відхиляє зайве", () => {
    expect(parseResponse({ ...ok, price: -5 })).toMatch(/ціну/);
    expect(parseResponse({ ...ok, price: "12" })).toMatch(/ціну/);
    expect(parseResponse({ ...ok, days: 0 })).toMatch(/днів/);
    expect(parseResponse({ ...ok, days: 9999 })).toMatch(/днів/);
    expect(parseResponse({ ...ok, message: "ок" })).toMatch(/кілька слів/);
    expect(parseResponse(null)).toMatch(/Порожній/);
  });
});

describe("відгук виконавця доходить до замовника", () => {
  it("з'являється в пропозиціях на запит з даними профілю, оплатою й рейтингом; непубліковані не показуємо", async () => {
    const request = await createRequest("cust-a", { text: "Потрібен лендинг", tags: [{ id: "landing", label: "Лендинг" }], files: [] });
    await saveProfile("perf-a", { ...emptyProfile("Іван"), cityId: "kyiv", specialty: "Розробник сайтів", tags: ["landing", "website"], photo: "/api/uploads/photos/perf-a/x.jpg", published: true });
    await saveProfile("perf-b", { ...emptyProfile("Прихований"), cityId: "kyiv", specialty: "Розробник", tags: ["landing"], photo: "", published: false });
    expect((await feedFor("perf-a", ["landing", "website"])).some((item) => item.id === request.id)).toBe(true);

    await saveResponse("perf-a", request.id, { price: 9000, days: 5, message: "Добрий день, зроблю." });
    await saveResponse("perf-b", request.id, { price: 1000, days: 2, message: "Добрий день, теж зроблю." });
    await addPayment("perf-a", 300);
    const offers = await responsesFor(request);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ name: "Іван", price: 9000, days: 5, cityName: "Київ", performerId: "me-perf-a", promoted: true, rating: "—" });
    expect(offers[0].tier).toBeGreaterThanOrEqual(2);
    expect(offers[0].photo).toBe("/api/uploads/photos/perf-a/x.jpg");
  });

  it("закритий запит пропозицій не віддає", async () => {
    const { closeRequest } = await import("@/lib/server/request-repo");
    const request = await createRequest("cust-b", { text: "Зробити сайт", tags: [], files: [] });
    await closeRequest("cust-b", request.id);
    expect(await responsesFor({ ...request, status: "closed" })).toEqual([]);
  });
});

describe("теги запиту без поля запиту", () => {
  it("надіслані теги лишаються, а порожні добираються з тексту", async () => {
    const { withTags } = await import("@/lib/requests/derive-tags");
    expect(withTags("будь-що", [{ id: "landing", label: "Лендинг" }])).toEqual([{ id: "landing", label: "Лендинг" }]);
    const derived = withTags("Потрібен Telegram-бот для запису клієнтів у барбершоп з оплатою через Monobank", []);
    expect(derived.map((tag) => tag.id)).toEqual(expect.arrayContaining(["telegram-bot", "monobank"]));
    expect(derived.every((tag) => TAGS_BY_ID.has(tag.id) && tag.label.length > 0)).toBe(true);
    expect(withTags("привіт", [])).toEqual([]);
  });
});

describe("умови запиту словами", () => {
  it("бюджет, термін і місто чипами; порожнє не показуємо", async () => {
    const { requestFacts } = await import("@/lib/requests/format");
    expect(requestFacts({ budget: 15000, deadline: "week", cityId: "lviv" }, new Date())).toEqual([expect.stringMatching(/^до 15\D000 ₴$/), "Протягом тижня", "Львів"]);
    expect(requestFacts({ budget: null, deadline: null, cityId: null }, new Date())).toEqual([]);
    expect(requestFacts({}, new Date())).toEqual([]);
  });
});

describe("запити на карті", () => {
  it("гостю видно запити лише з містом і текстом: без акаунта, збігів і відгуків", async () => {
    await createRequest("cust-a", { text: "Потрібна допомога з дизайном", tags: [], files: [] });
    const items = await mapRequests(null, { tags: [], cityId: null });
    expect(items.length).toBeGreaterThan(3);
    expect(items.every((item) => item.matchedTags === 0 && item.response === null && !item.own)).toBe(true);
    expect(items.some((item) => item.point)).toBe(true);
    // Запит без міста теж на карті: у центрі України, з позначкою remote.
    const remote = items.filter((item) => item.place === "Віддалено");
    expect(remote.length).toBeGreaterThan(0);
    expect(remote.every((item) => item.remote && item.point && Math.hypot(item.point.lat - 48.4, (item.point.lng - 31.2) * 0.65) < 0.8)).toBe(true);
    expect(items.filter((item) => item.place !== "Віддалено").every((item) => !item.remote)).toBe(true);
  });

  it("точка поруч із центром міста й стабільна", async () => {
    const { CITIES } = await import("@/lib/map/cities");
    const items = await mapRequests(null, { tags: [], cityId: null });
    const lviv = CITIES.find((city) => city.id === "lviv")!;
    const placed = items.find((item) => item.place === "Львів")!;
    expect(Math.hypot(placed.point!.lat - lviv.lat, (placed.point!.lng - lviv.lng) * 0.65)).toBeLessThan(0.1);
    expect((await mapRequests(null, { tags: [], cityId: null })).find((item) => item.id === placed.id)!.point).toEqual(placed.point);
  });

  it("виконавцю додаємо збіг і його відгук, а власний запит позначено own", async () => {
    const request = await createRequest("cust-b", { text: "Потрібен інтернет-магазин", tags: [{ id: "online-store", label: "Інтернет-магазин" }, { id: "cart-checkout", label: "Кошик" }], files: [], cityId: "kyiv" });
    await saveResponse("perf-b", request.id, { price: 1000, days: 3, message: "Добрий день, зроблю." });
    const items = await mapRequests("perf-b", { tags: ["online-store", "cart-checkout"], cityId: null });
    expect(items.find((item) => item.id === request.id)).toMatchObject({ matchedTags: 2, response: { price: 1000 }, responses: 1 });
    expect((await mapRequests("cust-b", { tags: [], cityId: null })).find((item) => item.id === request.id)).toMatchObject({ own: true, place: "Київ" });
    expect((await mapRequests("perf-b", { tags: [], cityId: null })).some((item) => item.own)).toBe(false);
  });
});

describe("позначка «Змінено»", () => {
  it("editedAt є у стрічці й на карті лише в зміненого запиту, у нетронутого null", async () => {
    const touched = await createRequest("cust-a", { ...bot, text: "Бот, який згодом поправлять" });
    const untouched = await createRequest("cust-a", { ...bot, text: "Бот, який не чіпають" });
    expect((await feedFor("perf-a", ["telegram-bot"])).find((item) => item.id === touched.id)?.editedAt).toBeNull();
    const started = Date.now();
    await updateRequest("cust-a", touched.id, { ...bot, text: "Бот, який уже поправили" });
    const edited = (await feedFor("perf-a", ["telegram-bot"])).find((item) => item.id === touched.id)!.editedAt!;
    expect(Date.parse(edited)).toBeGreaterThanOrEqual(started);
    const feed = await feedFor("perf-a", ["telegram-bot"]);
    expect(feed.find((item) => item.id === touched.id)).toMatchObject({ editedAt: edited, text: "Бот, який уже поправили", createdAt: touched.createdAt });
    expect(feed.find((item) => item.id === untouched.id)?.editedAt).toBeNull();
    const map = await mapRequests("perf-a", { tags: ["telegram-bot"], cityId: null });
    expect(map.find((item) => item.id === touched.id)?.editedAt).toBe(edited);
    expect(map.find((item) => item.id === untouched.id)?.editedAt).toBeNull();
  });
});
