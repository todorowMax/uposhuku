import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { tagProposals, tagProposalUses, tagTermStats } from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { PROPOSAL_DAILY_LIMIT, cleanProposalText, listPendingProposals, proposeTag, removeProposalUse } from "@/lib/server/tag-proposal-repo";
import { pruneTermStats, recordUnknownTerms } from "@/lib/server/tag-term-repo";
import { unknownTerms } from "@/lib/tags/unknown-terms";
import { makeUser, useTestD1 } from "../helpers/d1";

let ctx: Awaited<ReturnType<typeof useTestD1>>;
beforeAll(async () => {
  ctx = await useTestD1();
  for (const id of ["a", "b", "c"]) await makeUser(ctx.db, id);
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await getDb().delete(tagProposalUses);
  await getDb().delete(tagProposals);
  await getDb().delete(tagTermStats);
});

describe("пропозиції тегів", () => {
  it("«Квантовий дзиґа» і «квантовий  ДЗИҐА» від двох людей — одна пропозиція, два голоси", async () => {
    const first = await proposeTag("a", { text: "Квантовий дзиґа", context: "profile" });
    const second = await proposeTag("b", { text: "квантовий  ДЗИҐА", context: "work", entityId: "w1" });
    expect(first.kind).toBe("proposed");
    expect(second.kind).toBe("proposed");
    expect(await getDb().select().from(tagProposals)).toHaveLength(1);
    expect(await getDb().select().from(tagProposalUses)).toHaveLength(2);
    // Текст лишається від першої людини.
    expect((await getDb().select().from(tagProposals))[0].text).toBe("Квантовий дзиґа");
  });

  it("повторна пропозиція тієї самої людини в тому самому місці нічого не множить", async () => {
    await proposeTag("a", { text: "квантовий дзиґа", context: "profile" });
    await proposeTag("a", { text: "квантовий дзиґа", context: "profile" });
    expect(await getDb().select().from(tagProposalUses)).toHaveLength(1);
  });

  it("якщо такий тег уже є, повертає existing", async () => {
    expect(await proposeTag("a", { text: "тг бот", context: "profile" })).toEqual({ kind: "existing", tagId: "telegram-bot" });
    expect(await getDb().select().from(tagProposals)).toHaveLength(0);
  });

  it("відхиляє контакти, посилання, сміття й надто коротке чи довге", async () => {
    for (const text of ["+380991112233", "@nick_name", "https://x.com", "Пишіть мені в telegram", "a", "Я".repeat(41), "!!!", "<b>x</b>"]) {
      expect((await proposeTag("a", { text, context: "profile" })).kind, text).toBe("invalid");
    }
    expect(await getDb().select().from(tagProposals)).toHaveLength(0);
    expect("error" in cleanProposalText(5)).toBe(true);
  });

  it(`ліміт: не більше ${PROPOSAL_DAILY_LIMIT} пропозицій на добу від людини`, async () => {
    for (let index = 0; index < PROPOSAL_DAILY_LIMIT; index++) {
      expect((await proposeTag("a", { text: `вигадана штука ${"абвгдежзик"[index]}${index}`, context: "profile" })).kind).toBe("proposed");
    }
    expect((await proposeTag("a", { text: "ще одна вигадана", context: "profile" })).kind).toBe("limit");
    // Інша людина не заблокована.
    expect((await proposeTag("b", { text: "ще одна вигадана", context: "profile" })).kind).toBe("proposed");
  });

  it("закрита пропозиція повертає тег, відхилена — відмову", async () => {
    await proposeTag("a", { text: "вебфлоу кмс", context: "profile" });
    await getDb().update(tagProposals).set({ status: "mapped", resolvedTagId: "webflow" });
    expect(await proposeTag("b", { text: "вебфлоу кмс", context: "profile" })).toEqual({ kind: "existing", tagId: "webflow" });
    await getDb().update(tagProposals).set({ status: "rejected" });
    expect((await proposeTag("c", { text: "вебфлоу кмс", context: "profile" })).kind).toBe("invalid");
  });

  it("мої пропозиції на розгляді: окремо за контекстом, закриті не показуємо; видалення прибирає лише мій голос", async () => {
    await proposeTag("a", { text: "перша штука", context: "profile" });
    await proposeTag("a", { text: "друга штука", context: "work", entityId: "w7" });
    await proposeTag("b", { text: "перша штука", context: "profile" });
    const mine = await listPendingProposals("a");
    expect(mine.map((item) => [item.text, item.context, item.entityId]).sort()).toEqual([["друга штука", "work", "w7"], ["перша штука", "profile", ""]]);

    await removeProposalUse("a", mine.find((item) => item.text === "перша штука")!.id, "profile", "");
    expect((await listPendingProposals("a")).map((item) => item.text)).toEqual(["друга штука"]);
    expect((await listPendingProposals("b")).map((item) => item.text)).toEqual(["перша штука"]);

    await getDb().update(tagProposals).set({ status: "added", resolvedTagId: "webflow" });
    expect(await listPendingProposals("a")).toEqual([]);
  });
});

describe("слова із запитів, яких словник не знає", () => {
  it("вилучає незнайомі слова й пари, але не теги, не службові й не цифри з адресами", () => {
    const terms = unknownTerms("Потрібен бот для барбершопу з оплатою через квантопей, телефон 0991112233, пошта a@b.com").map((term) => term.sample);
    expect(terms).toContain("квантопей");
    expect(terms).not.toContain("com");
    expect(terms.some((term) => /\d/.test(term))).toBe(false);
    expect(terms).not.toContain("потрібен");
    expect(terms).not.toContain("для");
    expect(terms).not.toContain("бот");
    expect(terms.join(" ")).not.toMatch(/0991112233|a@b/);
  });

  it("основа слова об'єднує форми, а текст без сміття дає порожньо", () => {
    const a = unknownTerms("Хочу зробити квантопліс").map((term) => term.key);
    const b = unknownTerms("Потрібен квантоплісу").map((term) => term.key);
    expect(a.some((key) => b.includes(key))).toBe(true);
    expect(unknownTerms("Потрібен сайт для кав'ярні").map((term) => term.sample)).not.toContain("сайт");
    expect(unknownTerms("   ")).toEqual([]);
  });

  it("не більше 20 термінів з одного запиту", () => {
    const text = Array.from({ length: 80 }, (_, index) => `слово${String.fromCharCode(1072 + (index % 30))}${String.fromCharCode(1072 + ((index * 7) % 30))}ннн`).join(" ");
    expect(unknownTerms(text).length).toBeLessThanOrEqual(20);
  });

  it("лічильник росте з кожним запитом; одноразові через 30 днів прибираються", async () => {
    await recordUnknownTerms("зробіть мені рендерінг гоблінів");
    await recordUnknownTerms("потрібен рендерінг");
    const rows = await getDb().select().from(tagTermStats);
    const rendering = rows.find((row) => row.sample === "рендерінг");
    expect(rendering?.requests).toBe(2);
    const once = rows.filter((row) => row.requests === 1);
    expect(once.length).toBeGreaterThan(0);

    await pruneTermStats(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const left = await getDb().select().from(tagTermStats);
    expect(left.every((row) => row.requests > 1)).toBe(true);
    expect(left.some((row) => row.sample === "рендерінг")).toBe(true);
  });
});

describe("закриття пропозиції (tags:resolve)", () => {
  it("статус і тег профілям та роботам; запитам лише сигнал; повторний запуск безпечний", async () => {
    const { resolveSql } = await import("@/lib/telemetry/tags-resolve");
    await ctx.db.prepare("insert or ignore into profiles (user_id, name, updated_at) values ('a', 'А', 1)").run();
    await ctx.db.prepare("insert or ignore into projects (id, user_id, position, title, description, url) values ('a:w1', 'a', 0, '', '', '')").run();
    const first = await proposeTag("a", { text: "квантовий дзиґа", context: "profile" });
    await proposeTag("a", { text: "квантовий дзиґа", context: "work", entityId: "w1" });
    await proposeTag("b", { text: "квантовий дзиґа", context: "request" });
    if (first.kind !== "proposed") throw new Error("очікувалась пропозиція");

    const uses = (await getDb().select().from(tagProposalUses)).map((use) => ({ user_id: use.userId, context: use.context, entity_id: use.entityId }));
    const sql = resolveSql({ proposalId: first.proposal.id, uses, tagId: "figma", status: "added", note: "додали" });
    for (let round = 0; round < 2; round++) for (const statement of sql) await ctx.db.prepare(statement).run();

    const proposal = (await getDb().select().from(tagProposals))[0];
    expect(proposal).toMatchObject({ status: "added", resolvedTagId: "figma", note: "додали" });
    expect((await ctx.db.prepare("select source from profile_tags where user_id = 'a' and tag_id = 'figma'").all()).results).toEqual([{ source: "manual" }]);
    expect((await ctx.db.prepare("select source from project_tags where project_id = 'a:w1' and tag_id = 'figma'").all()).results).toEqual([{ source: "manual" }]);
    expect(sql.filter((statement) => statement.includes("profile_tags") || statement.includes("project_tags"))).toHaveLength(2);
    // Закрита пропозиція зникає з «на розгляді».
    expect(await listPendingProposals("a")).toEqual([]);
  });

  it("відхилення лише ставить статус; без тегу додавання неможливе", async () => {
    const { resolveSql } = await import("@/lib/telemetry/tags-resolve");
    expect(resolveSql({ proposalId: "tp_1", uses: [{ user_id: "a", context: "profile", entity_id: "" }], status: "rejected", note: "ні" })).toHaveLength(1);
    expect(() => resolveSql({ proposalId: "tp_1", uses: [], status: "added" })).toThrow(/--tag/);
  });
});
