import { describe, expect, it } from "vitest";
import { addKyivDays, bucketForDays, daysUntil, deadlineWindow, kyivToday, resolveDeadlineDate } from "@/lib/requests/deadline-date";
import { deadlineDateLabel, deadlineLabel, deadlineText, requestFacts } from "@/lib/requests/format";
import { parseDraft } from "@/lib/requests/parse-draft";
import { canSaveEdit, draftFromForm, formChanged, formFromRequest } from "@/lib/requests/edit-draft";
import type { RequestDraft } from "@/lib/requests/types";

/** 16 листопада 2026, 12:00 за Києвом (UTC+2). */
const NOON = new Date("2026-11-16T10:00:00Z");

describe("своя дата терміну: календарний день за Києвом", () => {
  it("сьогодні за Києвом, а не за UTC: о 00:30 за Києвом уже наступна доба", () => {
    expect(kyivToday(NOON)).toBe("2026-11-16");
    expect(kyivToday(new Date("2026-11-16T22:30:00Z"))).toBe("2026-11-17");
    expect(kyivToday(new Date("2026-11-16T21:59:00Z"))).toBe("2026-11-16");
    // Літній час (UTC+3): 21:30 UTC уже наступна доба за Києвом.
    expect(kyivToday(new Date("2026-07-10T21:30:00Z"))).toBe("2026-07-11");
  });

  it("дні до дати рахуються без зсуву: сьогодні 0, завтра 1, учора -1, через перехід на зимовий час теж цілі", () => {
    expect(daysUntil("2026-11-16", NOON)).toBe(0);
    expect(daysUntil("2026-11-17", NOON)).toBe(1);
    expect(daysUntil("2026-11-15", NOON)).toBe(-1);
    expect(daysUntil("2026-11-17", new Date("2026-11-16T22:30:00Z"))).toBe(0);
    expect(daysUntil("2026-10-20", new Date("2026-10-24T10:00:00Z"))).toBe(-4);
    expect(daysUntil("2026-11-02", new Date("2026-10-20T10:00:00Z"))).toBe(13);
  });

  it("межі поля: від сьогодні до сьогодні + 365 днів, за замовчуванням + 14", () => {
    expect(deadlineWindow(NOON)).toEqual({ min: "2026-11-16", max: "2027-11-16", fallback: "2026-11-30" });
    expect(addKyivDays(new Date("2027-12-20T10:00:00Z"), 365)).toBe("2028-12-19");
  });
});

describe("готовий строк за кількістю днів", () => {
  it.each([
    [0, "asap"],
    [3, "asap"],
    [4, "week"],
    [7, "week"],
    [8, "two_weeks"],
    [14, "two_weeks"],
    [15, "month"],
    [31, "month"],
    [32, "flexible"],
    [365, "flexible"],
  ] as const)("%i днів -> %s", (days, bucket) => {
    expect(bucketForDays(days)).toBe(bucket);
  });
});

describe("перевірка своєї дати", () => {
  it("сьогодні й найдальша дата проходять, готовий строк береться з днів", () => {
    expect(resolveDeadlineDate("2026-11-16", NOON)).toEqual({ ok: true, date: "2026-11-16", deadline: "asap" });
    expect(resolveDeadlineDate("2026-11-19", NOON)).toMatchObject({ ok: true, deadline: "asap" });
    expect(resolveDeadlineDate("2026-11-20", NOON)).toMatchObject({ ok: true, deadline: "week" });
    expect(resolveDeadlineDate("2026-11-30", NOON)).toMatchObject({ ok: true, deadline: "two_weeks" });
    expect(resolveDeadlineDate("2026-12-17", NOON)).toMatchObject({ ok: true, deadline: "month" });
    expect(resolveDeadlineDate("2026-12-18", NOON)).toMatchObject({ ok: true, deadline: "flexible" });
    expect(resolveDeadlineDate("2027-11-16", NOON)).toMatchObject({ ok: true, deadline: "flexible" });
  });

  it("минула дата й дата далі ніж 365 днів відхиляються з причиною", () => {
    expect(resolveDeadlineDate("2026-11-15", NOON)).toEqual({ ok: false, reason: "Дата терміну вже минула." });
    expect(resolveDeadlineDate("2027-11-17", NOON)).toMatchObject({ ok: false, reason: expect.stringContaining("365") });
  });

  it("не дата: інший формат, неіснуючий день, не рядок", () => {
    for (const bad of ["16.11.2026", "2026-11-16T10:00:00Z", "2026-02-30", "2026-13-01", "2026-00-10", "2026-1-5", "", null, 20261116, undefined]) {
      expect(resolveDeadlineDate(bad, NOON), String(bad)).toMatchObject({ ok: false });
    }
  });

  it("о 00:30 за Києвом «вчорашня» за UTC дата вже минула, а сьогоднішня за Києвом проходить", () => {
    const night = new Date("2026-11-16T22:30:00Z");
    expect(resolveDeadlineDate("2026-11-16", night)).toMatchObject({ ok: false });
    expect(resolveDeadlineDate("2026-11-17", night)).toMatchObject({ ok: true, deadline: "asap" });
  });
});

describe("підпис терміну", () => {
  it("«До 25 листопада»; рік лише коли він не поточний", () => {
    expect(deadlineDateLabel("2026-11-25", NOON)).toBe("До 25 листопада");
    expect(deadlineDateLabel("2027-01-05", NOON)).toBe("До 5 січня 2027 р.");
    // У грудні 2026 дата на січень 2027 теж з роком, а на кінець грудня без.
    expect(deadlineDateLabel("2026-12-31", NOON)).toBe("До 31 грудня");
  });

  it("поточний рік рахується за Києвом: у новорічну ніч за UTC ще 2026, за Києвом уже 2027", () => {
    const newYear = new Date("2026-12-31T22:30:00Z");
    expect(deadlineDateLabel("2027-02-01", newYear)).toBe("До 1 лютого");
  });

  it("своя дата замінює підпис готового строку; без неї береться готовий", () => {
    expect(deadlineText("Протягом тижня", "2026-11-25", NOON)).toBe("До 25 листопада");
    expect(deadlineText("Протягом тижня", null, NOON)).toBe("Протягом тижня");
    expect(deadlineText(null, undefined, NOON)).toBeNull();
    expect(deadlineLabel({ deadline: "week", deadlineDate: "2026-11-25" }, NOON)).toBe("До 25 листопада");
    expect(deadlineLabel({ deadline: "week", deadlineDate: null }, NOON)).toBe("Протягом тижня");
    expect(deadlineLabel({}, NOON)).toBeNull();
  });

  it("умови запиту чипами показують дату замість готового строку", () => {
    expect(requestFacts({ budget: null, deadline: "week", deadlineDate: "2026-11-25", cityId: "lviv" }, NOON)).toEqual(["До 25 листопада", "Львів"]);
  });
});

describe("parseDraft: своя дата", () => {
  const base = { text: "Потрібен сайт-візитка для майстерні" };

  it("дата перекриває готовий строк: бакет виводиться з днів", () => {
    const draft = parseDraft({ ...base, deadline: "asap", deadlineDate: "2026-12-10" }, { now: NOON });
    expect(draft).toMatchObject({ deadline: "month", deadlineDate: "2026-12-10" });
  });

  it("без дати поведінка прежня: готовий строк як є, дата null", () => {
    expect(parseDraft({ ...base, deadline: "week" }, { now: NOON })).toMatchObject({ deadline: "week", deadlineDate: null });
    expect(parseDraft({ ...base, deadline: "week", deadlineDate: null }, { now: NOON })).toMatchObject({ deadline: "week", deadlineDate: null });
    expect(parseDraft({ ...base, deadlineDate: "" }, { now: NOON })).toMatchObject({ deadline: null, deadlineDate: null });
  });

  it("неправильна, минула чи задалека дата дає відмову з причиною, а не тихий пропуск", () => {
    for (const bad of ["завтра", "2026-02-30", "2026-11-15", "2027-11-17", 5]) {
      expect(typeof parseDraft({ ...base, deadlineDate: bad }, { now: NOON }), String(bad)).toBe("string");
    }
  });

  it("правка: та сама збережена дата проходить, навіть якщо вже минула; інша минула ні", () => {
    const later = new Date("2026-12-20T10:00:00Z");
    expect(parseDraft({ ...base, deadlineDate: "2026-11-25" }, { now: later, keepDate: "2026-11-25" })).toMatchObject({ deadlineDate: "2026-11-25" });
    expect(typeof parseDraft({ ...base, deadlineDate: "2026-11-26" }, { now: later, keepDate: "2026-11-25" })).toBe("string");
    expect(typeof parseDraft({ ...base, deadlineDate: "2026-11-25" }, { now: later })).toBe("string");
  });
});

describe("правка запиту: своя дата", () => {
  const saved: RequestDraft = { text: "Потрібен сайт-візитка для майстерні", tags: [], files: [], deadline: "week", deadlineDate: "2026-11-20" };

  it("збережена дата потрапляє у форму й назад у чернетку", () => {
    const form = formFromRequest(saved);
    expect(form).toMatchObject({ deadline: "week", deadlineDate: "2026-11-20" });
    expect(draftFromForm(form, [], (id) => id)).toMatchObject({ deadlineDate: "2026-11-20" });
    expect(formChanged(saved, form)).toBe(false);
  });

  it("зміна й прибирання дати, перехід на готовий строк видно як зміну", () => {
    expect(canSaveEdit(saved, { ...formFromRequest(saved), deadlineDate: "2026-11-27" })).toBe(true);
    expect(formChanged(saved, { ...formFromRequest(saved), deadline: null, deadlineDate: null })).toBe(true);
    expect(formChanged(saved, { ...formFromRequest(saved), deadline: "month", deadlineDate: null })).toBe(true);
  });

  it("зі своєю датою готовий строк-знімок у порівнянні не бере участі", () => {
    expect(formChanged(saved, { ...formFromRequest(saved), deadline: null })).toBe(false);
    const bare: RequestDraft = { text: saved.text, tags: [], files: [], deadline: "week" };
    expect(formChanged(bare, { ...formFromRequest(bare), deadlineDate: "2026-11-20" })).toBe(true);
  });
});
