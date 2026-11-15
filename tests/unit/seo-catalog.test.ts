import { describe, expect, it } from "vitest";
import { CITIES, cityLocative } from "@/lib/map/cities";
import {
  MIN_INDEXABLE_PERFORMERS,
  catalogHeading,
  catalogIndexable,
  catalogPath,
  indexableCatalogPaths,
  medianBudget,
  nearestCities,
  relatedTagIds,
  resolveCatalogParams,
  type VisiblePerformer,
} from "@/lib/seo/catalog";
import { allTagSlugs, tagIdBySlug, tagSlug } from "@/lib/tags/catalog";
import { TAGS } from "@/lib/tags/dictionary";

const performer = (userId: string, cityId: string, tags: string[]): VisiblePerformer => ({
  userId,
  cityId,
  tags,
  name: userId,
  specialty: "Розробник",
  photo: "",
});

describe("слаги тегів каталогу", () => {
  it("унікальні, лише латиниця, цифри й дефіси", () => {
    const slugs = allTagSlugs();
    expect(new Set(slugs).size).toBe(TAGS.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("слаг веде до свого тегу, невідомий слаг і id з іншим слагом дають null", () => {
    expect(tagIdBySlug("lendynhy")).toBe("landing");
    expect(tagSlug("landing")).toBe("lendynhy");
    expect(tagIdBySlug("landing")).toBeNull();
    expect(tagIdBySlug("nema-takoho")).toBeNull();
    expect(tagIdBySlug("")).toBeNull();
  });
});

describe("заголовки й адреси каталогу", () => {
  it("h1 «Розробка лендингів у Львові», без міста лише послуга, для тегу без заголовка назва зі словника", () => {
    expect(catalogHeading("landing", "lviv")).toBe("Розробка лендингів у Львові");
    expect(catalogHeading("landing")).toBe("Розробка лендингів");
    expect(catalogHeading("pwa", "kyiv")).toBe("PWA у Києві");
    expect(catalogPath("landing", "lviv")).toBe("/poslugy/lendynhy/lviv");
    expect(catalogPath("landing")).toBe("/poslugy/lendynhy");
  });

  it("кожне місто має місцевий відмінок з прийменником", () => {
    for (const city of CITIES) expect(cityLocative(city.id)).toMatch(/^[ув] \S+/u);
  });

  it("адреса з невідомим тегом або містом не розбирається", () => {
    expect(resolveCatalogParams("lendynhy")).toEqual({ tagId: "landing", cityId: null });
    expect(resolveCatalogParams("lendynhy", "lviv")).toEqual({ tagId: "landing", cityId: "lviv" });
    expect(resolveCatalogParams("lendynhy", "atlantis")).toBeNull();
    expect(resolveCatalogParams("nema-takoho", "lviv")).toBeNull();
  });
});

describe("медіана бюджету й поріг індексації", () => {
  it("медіана рахується лише з бюджетів: непарна, парна, порожня", () => {
    expect(medianBudget([5000, null, 12000, 9000])).toBe(9000);
    expect(medianBudget([10000, 20000, null, 0])).toBe(15000);
    expect(medianBudget([null, null])).toBeNull();
    expect(medianBudget([])).toBeNull();
  });

  it("в індекс лише від трьох виконавців", () => {
    expect(MIN_INDEXABLE_PERFORMERS).toBe(3);
    expect(catalogIndexable(2)).toBe(false);
    expect(catalogIndexable(3)).toBe(true);
  });

  it("список сторінок для sitemap: лише від трьох справжніх виконавців, демо не рахуються", () => {
    const list = [
      performer("a", "lviv", ["landing", "seo"]),
      performer("b", "lviv", ["landing"]),
      performer("c", "kyiv", ["landing"]),
      performer("demo-d", "lviv", ["landing", "seo"]),
      performer("demo-e", "lviv", ["seo"]),
    ];
    const paths = indexableCatalogPaths(list);
    expect(paths).toContainEqual({ tagId: "landing", cityId: null });
    expect(paths).not.toContainEqual({ tagId: "landing", cityId: "lviv" });
    expect(paths.some((item) => item.tagId === "seo")).toBe(false);
    const more = [...list, performer("f", "lviv", ["landing"])];
    expect(indexableCatalogPaths(more)).toContainEqual({ tagId: "landing", cityId: "lviv" });
  });
});

describe("сусіди й споріднені теги", () => {
  it("найближчі міста: без самого міста, від найближчого", () => {
    const near = nearestCities("kyiv", ["kyiv", "lviv", "bila-tserkva", "zhytomyr"], 2);
    expect(near).toEqual(["bila-tserkva", "zhytomyr"]);
  });

  it("споріднені: батько, діти й брати, без самого тегу", () => {
    const related = relatedTagIds("landing");
    expect(related).toContain("website");
    expect(related).toContain("corporate-site");
    expect(related).not.toContain("landing");
    expect(relatedTagIds("nema")).toEqual([]);
  });
});
