import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { emptyProfile } from "@/lib/profile/types";
import { getCatalog } from "@/lib/server/catalog-repo";
import { addPayment } from "@/lib/server/placement-repo";
import { saveProfile } from "@/lib/server/profile-repo";
import { createRequest } from "@/lib/server/request-repo";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/json-ld";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const savedSiteUrl = process.env.SITE_URL;

const profile = (name: string, cityId: string, over: { published?: boolean; tags?: string[] } = {}) => ({
  ...emptyProfile(name),
  cityId,
  specialty: "Веброзробник",
  tags: over.tags ?? ["landing"],
  published: over.published ?? true,
});

const request = (userId: string, over: { budget?: number | null; channelOptIn?: boolean; cityId?: string; tag?: string }) =>
  createRequest(userId, {
    text: "Потрібен лендинг",
    budget: over.budget ?? null,
    cityId: over.cityId ?? "lviv",
    tags: [{ id: over.tag ?? "landing", label: "Лендинг" }],
    files: [],
    channelOptIn: over.channelOptIn,
  });

beforeAll(async () => {
  process.env.SITE_URL = "https://findlyfy.com";
  ctx = await useTestD1();
  const ids = ["cp-1", "cp-2", "cp-3", "cp-unpaid", "cp-draft", "cp-kyiv", "cp-client", "demo-cp"];
  for (const id of ids) await makeUser(ctx.db, id);
  // На карті: опубліковані й оплачені. Три у Львові, один у Києві; ще неоплачений, чернетка й демо.
  for (const id of ["cp-1", "cp-2", "cp-3"]) await saveProfile(id, profile(id, "lviv"));
  await saveProfile("cp-kyiv", profile("cp-kyiv", "kyiv"));
  await saveProfile("cp-unpaid", profile("cp-unpaid", "lviv"));
  await saveProfile("cp-draft", profile("cp-draft", "lviv", { published: false }));
  await saveProfile("demo-cp", profile("demo-cp", "lviv"));
  for (const id of ["cp-1", "cp-2", "cp-3", "cp-kyiv", "cp-draft", "demo-cp"]) await addPayment(id, 1000);
  // Запити: з бюджетом 6000 і 10000 у Львові, 100000 у Києві, без бюджету, закритий дозвіл і чужий тег.
  await request("cp-client", { budget: 6000 });
  await request("cp-client", { budget: 10000 });
  await request("cp-client", { budget: 100000, cityId: "kyiv" });
  await request("cp-client", { budget: null });
  await request("cp-client", { budget: 999999, channelOptIn: false });
  await request("cp-client", { budget: 777777, tag: "seo" });
});
afterAll(async () => {
  if (savedSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = savedSiteUrl;
  await ctx.close();
});

describe("каталог послуг", () => {
  it("у списку лише виконавці з карти: опублікований профіль і розміщення від 2-го рівня", async () => {
    const data = await getCatalog("landing", "lviv");
    const names = data.performers.map((item) => item.name).sort();
    expect(names).toEqual(["cp-1", "cp-2", "cp-3", "demo-cp"]);
    expect(data.performerCount).toBe(4);
    const all = await getCatalog("landing", null);
    expect(all.performers.map((item) => item.name)).not.toContain("cp-unpaid");
    expect(all.performers.map((item) => item.name)).not.toContain("cp-draft");
  });

  it("DTO виконавця без пошти й id користувача; id це me-<id> з адреси профілю", async () => {
    const data = await getCatalog("landing", "lviv");
    expect(Object.keys(data.performers[0]).sort()).toEqual(["city", "cityId", "id", "name", "photoUrl", "rating", "reviews", "specialty"]);
    expect(JSON.stringify(data)).not.toContain("@example.com");
  });

  it("відкриті запити й медіана бюджету: лише дозволені автором, за тегом і містом", async () => {
    const lviv = await getCatalog("landing", "lviv");
    expect(lviv.openRequests).toBe(3);
    expect(lviv.medianBudget).toBe(8000);
    const country = await getCatalog("landing", null);
    expect(country.openRequests).toBe(4);
    expect(country.medianBudget).toBe(10000);
  });

  it("поріг індексації: три справжні виконавці у Львові так, у Києві один ні; демо не рахується", async () => {
    expect((await getCatalog("landing", "lviv")).indexable).toBe(true);
    expect((await getCatalog("landing", "kyiv")).indexable).toBe(false);
    expect((await getCatalog("landing", null)).indexable).toBe(true);
    expect((await getCatalog("seo", null)).indexable).toBe(false);
  });

  it("міста з виконавцями й споріднені теги з виконавцями", async () => {
    const data = await getCatalog("landing", null);
    expect(data.cities).toEqual([
      { cityId: "lviv", count: 4 },
      { cityId: "kyiv", count: 1 },
    ]);
    expect(data.relatedTags).toEqual([]);
  });
});

describe("sitemap і каталог", () => {
  it("містить лише сторінки, що проходять поріг, і не містить тонких", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://findlyfy.com/poslugy/lendynhy");
    expect(urls).toContain("https://findlyfy.com/poslugy/lendynhy/lviv");
    expect(urls).not.toContain("https://findlyfy.com/poslugy/lendynhy/kyiv");
    expect(urls.some((url) => url.includes("/poslugy/seo"))).toBe(false);
  });
});

describe("JSON-LD головної", () => {
  it("Organization і WebSite з адресою сайту", () => {
    expect(organizationJsonLd("https://findlyfy.com")).toMatchObject({ "@type": "Organization", name: "Findlyfy", url: "https://findlyfy.com" });
    expect(websiteJsonLd("https://findlyfy.com")).toMatchObject({ "@type": "WebSite", url: "https://findlyfy.com", inLanguage: "uk" });
  });
});
