import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyProfile } from "@/lib/profile/types";
import { profileJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { getPublicProfile, saveProfile } from "@/lib/server/profile-repo";
import { addReview } from "@/lib/server/review-repo";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["pp-a", "pp-b", "pp-draft", "pp-client"]) await makeUser(ctx.db, id);
  const base = { ...emptyProfile("Олена Коваль"), cityId: "lviv", specialty: "Веброзробниця", bio: "Роблю лендинги.", tags: ["landing", "website"], published: true };
  await saveProfile("pp-a", {
    ...base,
    photo: "data:image/jpeg;base64,AAAA",
    works: [{ id: "w1", title: "Сайт кав'ярні", description: "Лендинг для кав'ярні", url: "https://example.com", tags: ["landing"], manualTags: [], hiddenTags: [] }],
  });
  await saveProfile("pp-b", { ...base, name: "Іван", photo: "/api/uploads/photos/pp-b/x.jpg" });
  await saveProfile("pp-draft", { ...base, published: false });
});
afterAll(async () => {
  await ctx.close();
});

const review = (performerId: string, dealId: string, stars: 1 | 2 | 3 | 4 | 5, verified: boolean) =>
  addReview("pp-client", { performerId, dealId, stars, text: "Дякую", author: "Марія", verified });

describe("публічний профіль для сторінки /p/<id>", () => {
  it("віддає лише публічні поля: без пошти, id користувача, координат і службових даних", async () => {
    const profile = await getPublicProfile("me-pp-a");
    expect(profile).not.toBeNull();
    expect(Object.keys(profile ?? {}).sort()).toEqual(
      ["average", "bio", "city", "cityId", "id", "name", "photoUrl", "reviews", "specialty", "stats", "tags", "verifiedRating", "works"].sort(),
    );
    const json = JSON.stringify(profile);
    for (const secret of ["pp-a@", "userId", "email", "lat", "lng", "published", "manualTags", "hiddenTags", "updatedAt"]) {
      expect(json).not.toContain(secret);
    }
    expect(profile).toMatchObject({ id: "me-pp-a", name: "Олена Коваль", city: "Львів", specialty: "Веброзробниця" });
  });

  it("data URL фото в DTO не потрапляє, адреса зі сховища потрапляє", async () => {
    expect((await getPublicProfile("me-pp-a"))?.photoUrl).toBeNull();
    expect((await getPublicProfile("me-pp-b"))?.photoUrl).toBe("/api/uploads/photos/pp-b/x.jpg");
  });

  it("не опублікований, невідомий і чужий за форматом id дають null", async () => {
    expect(await getPublicProfile("me-pp-draft")).toBeNull();
    expect(await getPublicProfile("me-nobody")).toBeNull();
    expect(await getPublicProfile("pp-a")).toBeNull();
    expect(await getPublicProfile("me-")).toBeNull();
  });

  it("рейтинг для розмітки лише з перевірених відгуків, і лише коли вони є", async () => {
    await review("me-pp-b", "d-1", 2, false);
    const unverifiedOnly = await getPublicProfile("me-pp-b");
    expect(unverifiedOnly?.reviews).toHaveLength(1);
    expect(unverifiedOnly?.verifiedRating).toBeNull();
    expect(serializeJsonLd(profileJsonLd(unverifiedOnly!, "https://x.test/p/me-pp-b"))).not.toContain("aggregateRating");

    await review("me-pp-b", "d-2", 5, true);
    await review("me-pp-b", "d-3", 4, true);
    const mixed = await getPublicProfile("me-pp-b");
    expect(mixed?.reviews.filter((item) => item.verified)).toHaveLength(2);
    expect(mixed?.verifiedRating).toEqual({ value: 4.5, count: 2 });
    const ld = profileJsonLd(mixed!, "https://x.test/p/me-pp-b") as { mainEntity: { aggregateRating: { ratingValue: number; ratingCount: number } } };
    expect(ld.mainEntity.aggregateRating).toMatchObject({ ratingValue: 4.5, ratingCount: 2 });
  });
});

describe("JSON-LD профілю", () => {
  it("ProfilePage з Person: прежні поля й knowsAbout із тегів; `<` в тексті екранується", async () => {
    const profile = await getPublicProfile("me-pp-a");
    const ld = profileJsonLd({ ...profile!, bio: "</script><b>" }, "https://x.test/p/me-pp-a") as {
      "@type": string;
      mainEntity: { "@type": string; name: string; jobTitle: string; knowsAbout: string[]; homeLocation: unknown };
    };
    expect(ld["@type"]).toBe("ProfilePage");
    expect(ld.mainEntity).toMatchObject({ "@type": "Person", name: "Олена Коваль", jobTitle: "Веброзробниця" });
    expect(ld.mainEntity.knowsAbout).toEqual(["Лендинг", "Сайт"]);
    expect(ld.mainEntity.homeLocation).toBeTruthy();
    expect(serializeJsonLd(ld)).not.toContain("</script>");
  });
});
