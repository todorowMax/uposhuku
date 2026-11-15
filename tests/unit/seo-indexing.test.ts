import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { emptyProfile } from "@/lib/profile/types";
import { indexingOpen, robotsHeader, robotsMeta } from "@/lib/seo/indexing";
import { saveProfile } from "@/lib/server/profile-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

describe("перемикач індексації", () => {
  it("відкритий лише на проді з SEO_INDEXING=on", () => {
    expect(indexingOpen({ DEPLOY_ENV: "production", SEO_INDEXING: "on" })).toBe(
      true,
    );
    expect(
      indexingOpen({ DEPLOY_ENV: "production", SEO_INDEXING: " ON " }),
    ).toBe(true);
  });

  it("закритий типово, без змінної й на інших середовищах", () => {
    expect(indexingOpen({})).toBe(false);
    expect(indexingOpen({ DEPLOY_ENV: "production" })).toBe(false);
    expect(
      indexingOpen({ DEPLOY_ENV: "production", SEO_INDEXING: "off" }),
    ).toBe(false);
    expect(indexingOpen({ DEPLOY_ENV: "production", SEO_INDEXING: "1" })).toBe(
      false,
    );
    expect(
      indexingOpen({ DEPLOY_ENV: "development", SEO_INDEXING: "on" }),
    ).toBe(false);
    expect(indexingOpen({ SEO_INDEXING: "on" })).toBe(false);
  });

  it("meta robots і X-Robots-Tag слідують за перемикачем: закрито дає noindex, відкрито нічого не ставить", () => {
    const closed = { DEPLOY_ENV: "development", SEO_INDEXING: "on" };
    expect(robotsMeta(closed)).toEqual({ index: false, follow: false });
    expect(robotsHeader(closed)).toBe("noindex, nofollow");
    const open = { DEPLOY_ENV: "production", SEO_INDEXING: "on" };
    expect(robotsMeta(open)).toBeUndefined();
    expect(robotsHeader(open)).toBeNull();
  });
});

describe("robots.txt і карта сайту за змінними середовища", () => {
  let ctx: Awaited<ReturnType<typeof useTestD1>>;
  const saved = {
    DEPLOY_ENV: process.env.DEPLOY_ENV,
    SEO_INDEXING: process.env.SEO_INDEXING,
    SITE_URL: process.env.SITE_URL,
  };

  beforeAll(async () => {
    ctx = await useTestD1();
    for (const id of ["ix-pub", "ix-draft", "demo-ix"])
      await makeUser(ctx.db, id);
    await saveProfile("ix-pub", {
      ...emptyProfile("Відкрита"),
      cityId: "kyiv",
      specialty: "Дизайнерка",
      published: true,
    });
    await saveProfile("ix-draft", {
      ...emptyProfile("Чернетка"),
      cityId: "kyiv",
      specialty: "Дизайнер",
      published: false,
    });
    await saveProfile("demo-ix", {
      ...emptyProfile("Демо"),
      cityId: "kyiv",
      specialty: "Демо",
      published: true,
    });
  });
  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("без змінних robots забороняє все й не має рядка Sitemap", () => {
    delete process.env.DEPLOY_ENV;
    delete process.env.SEO_INDEXING;
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
  });

  it("на dev із SEO_INDEXING=on сайт усе одно закритий", () => {
    process.env.DEPLOY_ENV = "development";
    process.env.SEO_INDEXING = "on";
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("на проді з SEO_INDEXING=on robots пускає й дає Sitemap зі SITE_URL", () => {
    process.env.DEPLOY_ENV = "production";
    process.env.SEO_INDEXING = "on";
    process.env.SITE_URL = "https://findlyfy.com/";
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("https://findlyfy.com/sitemap.xml");
  });

  it("карта сайту бере адресу зі SITE_URL і лише опубліковані справжні профілі", async () => {
    process.env.SITE_URL = "https://dev.findlyfy.com";
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://dev.findlyfy.com");
    expect(urls).toContain("https://dev.findlyfy.com/contacts");
    expect(urls).toContain("https://dev.findlyfy.com/p/me-ix-pub");
    expect(
      urls.some((url) => url.includes("ix-draft") || url.includes("demo-ix")),
    ).toBe(false);
    expect(
      urls.every((url) => url.startsWith("https://dev.findlyfy.com")),
    ).toBe(true);
  });
});
