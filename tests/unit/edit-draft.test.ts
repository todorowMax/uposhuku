import { describe, expect, it } from "vitest";
import { canSaveEdit, draftFromForm, editTextValid, formChanged, formFromRequest, initialRemote, initialTagState } from "@/lib/requests/edit-draft";
import { REQUEST_TEXT_MAX, type RequestDraft } from "@/lib/requests/types";

const saved: RequestDraft = {
  text: "Потрібен Telegram-бот для запису клієнтів",
  tags: [
    { id: "telegram-bot", label: "Telegram-бот" },
    { id: "online-booking", label: "Онлайн-запис" },
  ],
  files: [{ name: "brief.pdf", size: 1200, type: "application/pdf" }],
  budget: 15000,
  deadline: "week",
  cityId: "lviv",
  channelOptIn: true,
};

describe("правка запиту: що змінилось", () => {
  it("форма зі збереженого запиту не відрізняється від нього", () => {
    expect(formChanged(saved, formFromRequest(saved))).toBe(false);
  });

  it("запит без необов'язкових полів теж без змін (undefined = null, канал типово увімкнений)", () => {
    const bare: RequestDraft = { text: "Потрібен логотип", tags: [], files: [] };
    expect(formChanged(bare, formFromRequest(bare))).toBe(false);
    expect(formFromRequest(bare)).toMatchObject({ budget: null, deadline: null, cityId: null, channel: true });
  });

  it("пробіли навколо тексту змінами не вважаються", () => {
    expect(formChanged(saved, { ...formFromRequest(saved), text: `  ${saved.text}\n` })).toBe(false);
  });

  it.each([
    ["текст", { text: `${saved.text}, терміново` }],
    ["бюджет", { budget: 20000 }],
    ["бюджет прибрано", { budget: null }],
    ["термін", { deadline: "asap" as const }],
    ["місто", { cityId: "kyiv" }],
    ["канал", { channel: false }],
    ["тег додано", { tagIds: ["telegram-bot", "online-booking", "crm"] }],
    ["тег знято", { tagIds: ["telegram-bot"] }],
    ["файл прибрано", { files: [] }],
  ])("помічає зміну: %s", (_name, patch) => {
    expect(formChanged(saved, { ...formFromRequest(saved), ...patch })).toBe(true);
  });

  it("порядок тегів не є зміною", () => {
    expect(formChanged(saved, { ...formFromRequest(saved), tagIds: ["online-booking", "telegram-bot"] })).toBe(false);
  });
});

describe("правка запиту: чи можна зберегти", () => {
  it("без змін не можна", () => {
    expect(canSaveEdit(saved, formFromRequest(saved))).toBe(false);
  });

  it("зі змінами й нормальним текстом можна", () => {
    expect(canSaveEdit(saved, { ...formFromRequest(saved), budget: 20000 })).toBe(true);
  });

  it("закороткий і задовгий текст не можна, навіть зі змінами", () => {
    expect(canSaveEdit(saved, { ...formFromRequest(saved), text: "  ab " })).toBe(false);
    expect(canSaveEdit(saved, { ...formFromRequest(saved), text: "а".repeat(REQUEST_TEXT_MAX + 1) })).toBe(false);
    expect(editTextValid("а".repeat(REQUEST_TEXT_MAX))).toBe(true);
  });
});

describe("правка запиту: чернетка для сервера", () => {
  it("обрізає текст, зберігає назви старих тегів і бере назви нових зі словника", () => {
    const draft = draftFromForm({ ...formFromRequest(saved), text: "  Новий текст ", tagIds: ["telegram-bot", "crm"], budget: null }, saved.tags, (id) => `Назва ${id}`);
    expect(draft).toEqual({
      text: "Новий текст",
      tags: [
        { id: "telegram-bot", label: "Telegram-бот" },
        { id: "crm", label: "Назва crm" },
      ],
      files: saved.files,
      budget: null,
      deadline: "week",
      cityId: "lviv",
      channelOptIn: true,
    });
  });
});

describe("правка запиту: чип «Де»", () => {
  it("запит без міста відкривається як «Віддалено»; з містом: місто, не віддалено", () => {
    expect(initialRemote(null)).toBe(true);
    expect(initialRemote(undefined)).toBe(true);
    expect(initialRemote("lviv")).toBe(false);
  });

  it("збереження без змін дані не міняє: cityId лишається null, форма не вважається зміненою", () => {
    const remote: RequestDraft = { text: "Потрібен логотип для кав'ярні", tags: [], files: [] };
    const form = formFromRequest(remote);
    expect(form.cityId).toBeNull();
    expect(formChanged(remote, form)).toBe(false);
    expect(draftFromForm(form, [], (id) => id).cityId).toBeNull();
  });
});

describe("правка запиту: початковий стан тегів", () => {
  it("тег поза текстом був доданий вручну, прибраний із тексту лишається прибраним", () => {
    const state = initialTagState(["telegram-bot", "chatbot"], [
      { id: "telegram-bot", label: "Telegram-бот" },
      { id: "online-booking", label: "Онлайн-запис" },
    ]);
    expect(state).toEqual({ added: ["online-booking"], dismissed: ["chatbot"] });
  });
});
