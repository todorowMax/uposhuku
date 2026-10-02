import { describe, expect, it } from "vitest";
import { parseProfile } from "@/lib/profile/validate";
import { profileToPerformer } from "@/lib/profile/to-performer";
import { emptyProfile, missingForPublish, profileTags, provenTags, type Profile } from "@/lib/profile/types";
import { filterPerformers, primaryGroup } from "@/lib/map/groups";
import { matchProfiles } from "@/lib/tags/match";

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const complete = (): Profile => ({
  ...emptyProfile(),
  name: "Максим Тодоров",
  cityId: "lviv",
  specialty: "Розробник Telegram-ботів",
  bio: "Роблю боти.",
  tags: ["telegram-bot", "n8n"],
  photo: PHOTO,
  works: [{ id: "w1", title: "Бот", description: "Бот запису", url: "https://example.com", tags: ["telegram-bot", "online-booking"] }],
});

describe("профіль виконавця", () => {
  it("теги профілю: заявлені, потім з робіт, без повторів; підтверджені — з робіт", () => {
    const profile = complete();
    expect(profileTags(profile)).toEqual(["telegram-bot", "n8n", "online-booking"]);
    expect([...provenTags(profile)]).toEqual(["telegram-bot", "online-booking"]);
  });

  it("чого не вистачає для карти", () => {
    expect(missingForPublish(complete())).toEqual([]);
    expect(missingForPublish({ ...complete(), photo: "", cityId: "" })).toEqual(["фото", "місто"]);
    expect(missingForPublish({ ...complete(), tags: [], works: [] })).toEqual(["щонайменше 2 теги"]);
  });

  it("сервер лишає лише словникові теги й обрізає довжини", () => {
    const parsed = parseProfile({ ...complete(), tags: ["telegram-bot", "вигаданий-тег", 5], bio: "а".repeat(5000) }) as Profile;
    expect(parsed.tags).toEqual(["telegram-bot"]);
    expect(parsed.bio.length).toBe(800);
  });

  it("публікація без обов'язкового відхиляється, чернетка — ні", () => {
    expect(parseProfile({ ...complete(), photo: "", published: true })).toMatch(/фото/);
    expect(typeof parseProfile({ ...complete(), photo: "", published: false })).toBe("object");
  });

  it("відхиляє чужі посилання, не-JPEG фото й невідоме місто", () => {
    const work = (url: string) => ({ ...complete(), works: [{ ...complete().works[0], url }] });
    expect(parseProfile(work("javascript:alert(1)"))).toMatch(/http/);
    expect(parseProfile({ ...complete(), photo: "data:image/svg+xml;base64,AAAA" })).toMatch(/JPEG/);
    expect(parseProfile({ ...complete(), cityId: "atlantis" })).toMatch(/місто/);
  });

  it("профіль стає виконавцем на карті: свій, у місті, з тегами та групою", () => {
    const performer = profileToPerformer(complete(), "u1", 16)!;
    expect(performer).toMatchObject({ id: "me-u1", cityId: "lviv", mine: true, tier: 1, avatarIndex: 16 });
    expect(performer.tags).toEqual(["telegram-bot", "n8n", "online-booking"]);
    expect(primaryGroup(performer.tags)).toBe("automation");
    expect(performer.works[0]).toMatchObject({ kind: "bot", url: "https://example.com", tags: ["telegram-bot", "online-booking"] });
    expect(profileToPerformer({ ...complete(), cityId: "" }, "u1", 16)).toBeNull();
  });

  it("власний профіль знаходять за запитом і фільтром міста", () => {
    const me = profileToPerformer(complete(), "u1", 16)!;
    expect(matchProfiles(["telegram-bot"], [me])).toEqual(new Set([me.id]));
    expect(filterPerformers([me], { matches: null, groups: ["automation"], cities: ["lviv"], online: true })).toHaveLength(1);
    expect(filterPerformers([me], { matches: null, groups: ["design"], cities: [], online: false })).toHaveLength(0);
  });
});
