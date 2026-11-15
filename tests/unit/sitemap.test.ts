import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { emptyProfile } from "@/lib/profile/types";
import { saveProfile } from "@/lib/server/profile-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
const savedSiteUrl = process.env.SITE_URL;
beforeAll(async () => {
  process.env.SITE_URL = "https://findlyfy.com";
  ctx = await useTestD1();
  for (const id of ["sm-pub", "sm-draft", "demo-x"]) await makeUser(ctx.db, id);
  await saveProfile("sm-pub", { ...emptyProfile("Відкрита"), cityId: "kyiv", specialty: "Дизайнерка", published: true });
  await saveProfile("sm-draft", { ...emptyProfile("Чернетка"), cityId: "kyiv", specialty: "Дизайнер", published: false });
  await saveProfile("demo-x", { ...emptyProfile("Демо"), cityId: "kyiv", specialty: "Демо", published: true });
});
afterAll(async () => {
  if (savedSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = savedSiteUrl;
  await ctx.close();
});

describe("sitemap.xml", () => {
  it("містить головну, юридичні сторінки й лише опубліковані справжні профілі", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://findlyfy.com");
    expect(urls).toContain("https://findlyfy.com/contacts");
    expect(urls).toContain("https://findlyfy.com/p/me-sm-pub");
    expect(urls).not.toContain("https://findlyfy.com/p/me-sm-draft");
    expect(urls.some((url) => url.includes("me-demo-x"))).toBe(false);
    expect(urls.some((url) => url.includes("safe-deal"))).toBe(false);
  });
});
