import { describe, expect, it } from "vitest";
import { DELETED_NAME } from "@/lib/account/deletion";
import type { ChatLine } from "@/lib/chat/client";
import { dayLabel, listTime } from "@/lib/chat/dates";
import { conversationTitle, initialsOf, isOtherGone } from "@/lib/chat/display";
import { draftLimit } from "@/lib/chat/draft-limit";
import { buildFeed, isNearBottom, parseModeratorDecision, resolveDealId, scrollTopAfterPrepend } from "@/lib/chat/feed";

const NOW = new Date(2026, 10, 15, 14, 0);
/** Місцевий час, а не UTC: розділювачі днів рахуються за датою глядача. */
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();
let seq = 0;
const line = (over: Partial<ChatLine> & { day?: number }): ChatLine => ({ id: `m${++seq}`, from: "them", text: "текст", at: at(over.day ?? 15), ...over });
const event = (number: string, day = 15, hour = 10) => line({ kind: "system", text: `Угоду ${number} запропоновано`, contextId: `deal_${number}`, at: at(day, hour) });

describe("розділювачі днів", () => {
  it("сьогодні, вчора, дата, з роком лише для іншого року", () => {
    expect(dayLabel(at(15), NOW)).toBe("Сьогодні");
    expect(dayLabel(at(14, 23), NOW)).toBe("Вчора");
    expect(dayLabel(at(12), NOW)).toBe("12 листопада");
    expect(dayLabel(new Date(2025, 11, 31).toISOString(), NOW)).toContain("2025");
  });

  it("час у списку: сьогодні година, інакше дата", () => {
    expect(listTime(at(15, 9), NOW)).toBe("09:00");
    expect(listTime(at(12), NOW)).not.toContain(":");
  });
});

describe("стрічка: групування", () => {
  it("перед першим рядком кожного дня стоїть розділювач", () => {
    const feed = buildFeed([line({ day: 14 }), line({ day: 14 }), line({ day: 15 })], NOW);
    expect(feed.map((item) => item.type)).toEqual(["day", "message", "message", "day", "message"]);
    expect(feed[0]).toMatchObject({ label: "Вчора" });
    expect(feed[3]).toMatchObject({ label: "Сьогодні" });
  });

  it("підряд події однієї угоди збираються, репліка людини чи інша угода розривають групу", () => {
    const lines = [event("#AAAA"), event("#AAAA"), event("#AAAA"), line({}), event("#AAAA"), event("#BBBB"), event("#BBBB")];
    const deals = buildFeed(lines, NOW).flatMap((item) => (item.type === "deal" ? [[item.number, item.lines.length]] : []));
    expect(deals).toEqual([
      ["#AAAA", 3],
      ["#AAAA", 1],
      ["#BBBB", 2],
    ]);
  });

  it("новий день розриває групу тієї ж угоди", () => {
    const deals = buildFeed([event("#AAAA", 14), event("#AAAA", 15)], NOW).filter((item) => item.type === "deal");
    expect(deals).toHaveLength(2);
  });

  it("короткий рядок без номера лишається таблеткою, рішення модератора окремою карточкою", () => {
    const pill = line({ kind: "system", text: "Замовник оновив запит" });
    const decision = line({ kind: "system", text: "Модератор розглянув спір за угодою #AAAA: етап «Робота» виплачується виконавцю. Коментар модератора: Роботу прийнято" });
    const feed = buildFeed([event("#AAAA"), decision, pill], NOW);
    expect(feed.map((item) => item.type)).toEqual(["day", "deal", "moderator", "pill"]);
    expect(feed[2]).toMatchObject({ decision: { number: "#AAAA", outcome: "етап «Робота» виплачується виконавцю", comment: "Роботу прийнято" } });
  });

  it("рішення без коментаря й чужий текст", () => {
    expect(parseModeratorDecision("Модератор розглянув спір за угодою #AB12: кошти повертаються")).toEqual({ number: "#AB12", outcome: "кошти повертаються", comment: null });
    expect(parseModeratorDecision("Угоду #AB12 запропоновано")).toBeNull();
  });
});

describe("яка угода за номером", () => {
  const deals = [
    { id: "deal_1", number: "#AAAA" },
    { id: "deal_2", number: "#BBBB" },
  ];
  it("спершу за id в рядку, потім за номером; невідома дає undefined", () => {
    expect(resolveDealId([{ contextId: "deal_2" }], "#AAAA", deals)).toBe("deal_2");
    expect(resolveDealId([{ contextId: "old-id" }], "#AAAA", deals)).toBe("deal_1");
    expect(resolveDealId([{}], "#ZZZZ", deals)).toBeUndefined();
  });
});

describe("прокрутка", () => {
  it("внизу з запасом чи ні", () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 450, clientHeight: 500 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 500 })).toBe(false);
  });

  it("після вставки старіших зверху позиція зсувається на приріст висоти, тож людина лишається на тому самому повідомленні", () => {
    expect(scrollTopAfterPrepend({ scrollHeight: 1000, scrollTop: 0 }, 1800)).toBe(800);
    expect(scrollTopAfterPrepend({ scrollHeight: 1000, scrollTop: 30 }, 1000)).toBe(30);
  });
});

describe("підпис розмови", () => {
  const offer = { title: "Лендинг для кав'ярні" };
  it("замовник без імені підписаний запитом, з іменем ні, без запиту лишається словом", () => {
    expect(conversationTitle({ role: "performer", other: { name: "Замовник", nameless: true }, offer })).toBe(offer.title);
    expect(conversationTitle({ role: "performer", other: { name: "Олена" }, offer })).toBe("Олена");
    expect(conversationTitle({ role: "performer", other: { name: "Замовник", nameless: true } })).toBe("Замовник");
  });

  it("ініціали й видалений співрозмовник", () => {
    expect(initialsOf("Олена Коваль")).toBe("ОК");
    expect(initialsOf("«Лендинг»")).toBe("Л");
    expect(initialsOf("")).toBe("?");
    expect(isOtherGone({ other: { name: DELETED_NAME } })).toBe(true);
    expect(isOtherGone({ other: { name: "Олена" } })).toBe(false);
  });
});

describe("ліміт тексту", () => {
  it("лічильник з 90%, понад ліміт заборонено", () => {
    expect(draftLimit(100).show).toBe(false);
    expect(draftLimit(3600)).toMatchObject({ show: true, over: false });
    expect(draftLimit(4000).over).toBe(false);
    expect(draftLimit(4001)).toMatchObject({ over: true, text: "4001 з 4000" });
  });
});
