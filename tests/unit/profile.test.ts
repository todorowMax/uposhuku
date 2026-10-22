import { describe, expect, it } from "vitest";
import { parseProfile } from "@/lib/profile/validate";
import { profileToPerformer } from "@/lib/profile/to-performer";
import { emptyProfile, missingForPublish, profileTags, provenTags, type Profile } from "@/lib/profile/types";
import { filterPerformers, primaryGroup } from "@/lib/map/groups";
import { matchProfiles } from "@/lib/tags/match";
import { TAGS_BY_ID } from "@/lib/tags/dictionary";
import { combineTags } from "@/lib/tags/combine";

const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const complete = (): Profile => ({
  ...emptyProfile(),
  name: "Максим Тодоров",
  cityId: "lviv",
  specialty: "Розробник Telegram-ботів",
  bio: "Роблю боти.",
  tags: ["telegram-bot", "n8n"],
  manualTags: ["n8n"],
  photo: PHOTO,
  works: [{ id: "w1", title: "Бот", description: "Бот запису", url: "https://example.com", tags: ["telegram-bot", "online-booking"], manualTags: [], hiddenTags: [] }],
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
    const parsed = parseProfile({ ...complete(), specialty: "Розробник Telegram-ботів", manualTags: ["n8n", "вигаданий-тег", 5], bio: "а".repeat(5000) }) as Profile;
    expect(parsed.tags).toEqual(["telegram-bot", "n8n"]);
    expect(parsed.manualTags).toEqual(["n8n"]);
    expect(parsed.bio.length).toBe(800);
  });

  it("список tags з тіла запиту ігнорується: теги рахує сервер за текстом і ручними", () => {
    const parsed = parseProfile({ ...complete(), specialty: "Дизайнер", bio: "", manualTags: [], tags: ["telegram-bot", "n8n", "crm"] }) as Profile;
    expect(parsed.tags).not.toContain("n8n");
    expect(parsed.tags).not.toContain("crm");
  });

  it("прихований тег не повертається з тексту, а застарілий прихований відкидається", () => {
    const base = { ...complete(), specialty: "Розробник Telegram-ботів", bio: "", manualTags: [] };
    expect((parseProfile(base) as Profile).tags).toEqual(["telegram-bot"]);
    const hidden = parseProfile({ ...base, hiddenTags: ["telegram-bot", "crm"] }) as Profile;
    expect(hidden.tags).toEqual([]);
    expect(hidden.hiddenTags).toEqual(["telegram-bot"]);
  });

  it("ручний тег сильніший за прихований і живе без слова в тексті", () => {
    const parsed = parseProfile({ ...complete(), specialty: "Розробник", bio: "", manualTags: ["figma"], hiddenTags: ["figma"] }) as Profile;
    expect(parsed.tags).toEqual(["figma"]);
    expect(parsed.hiddenTags).toEqual([]);
  });

  it("ліміти: до 15 ручних і до 30 усього; ручні не витісняються текстом", () => {
    const manual = [...TAGS_BY_ID.keys()].slice(100, 130);
    const parsed = parseProfile({ ...complete(), specialty: "", bio: "", manualTags: manual }) as Profile;
    expect(parsed.manualTags).toHaveLength(15);
    expect(parsed.tags).toHaveLength(15);
    const work = parseProfile({ ...complete(), works: [{ ...complete().works[0], manualTags: manual }] }) as Profile;
    expect(work.works[0].manualTags).toHaveLength(5);
  });

  it("теги роботи рахуються з назви й опису", () => {
    const parsed = parseProfile({ ...complete(), works: [{ id: "w1", title: "Бот запису", description: "Telegram-бот для барбершопу", url: "", manualTags: ["n8n"] }] }) as Profile;
    expect(parsed.works[0].tags).toContain("telegram-bot");
    expect(parsed.works[0].tags).toContain("n8n");
    expect(parsed.works[0].manualTags).toEqual(["n8n"]);
  });

  it("публікація без обов'язкового відхиляється, чернетка — ні", () => {
    expect(parseProfile({ ...complete(), photo: "", published: true })).toMatch(/фото/);
    expect(typeof parseProfile({ ...complete(), photo: "", published: false })).toBe("object");
  });

  it("combineTags: текст, потім ручні; приховані зникають, ручні не ріжуться лімітом", () => {
    expect(combineTags({ auto: ["a", "b", "c"], manual: ["x"], hidden: ["b"] })).toEqual(["a", "c", "x"]);
    expect(combineTags({ auto: ["a", "b", "c"], manual: ["x", "y"], max: 3 })).toEqual(["a", "x", "y"]);
    expect(combineTags({ auto: ["a"], manual: ["a"], hidden: ["a"] })).toEqual(["a"]);
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

  it("точка на карті: округлюється, лише в межах України, потрапляє на карту", () => {
    const parsed = parseProfile({ ...complete(), location: { lat: 49.84123456, lng: 24.02987654 } });
    expect(parsed).toMatchObject({ location: { lat: 49.841, lng: 24.03 } });
    expect(parseProfile({ ...complete(), location: { lat: 10, lng: 24 } })).toMatch(/України/);
    expect(parseProfile({ ...complete(), location: { lat: "x", lng: 24 } })).toMatch(/України/);
    expect(parseProfile({ ...complete(), location: null })).toMatchObject({ location: null });
    const performer = profileToPerformer({ ...complete(), location: { lat: 49.8, lng: 24.1 } }, "u1", 0, 2)!;
    expect(performer).toMatchObject({ lat: 49.8, lng: 24.1, tier: 2 });
  });
});
