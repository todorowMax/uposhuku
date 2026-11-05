import { describe, expect, it } from "vitest";
import { splitAdvance } from "@/lib/deals/stage-presets";
import { validateDraft } from "@/lib/deals/machine";

describe("швидкий розподіл 30/70", () => {
  it("сума етапів дорівнює сумі угоди, а терміни — терміну", () => {
    const stages = splitAdvance(12_501, 15);
    expect(stages.map((stage) => stage.amount)).toEqual([3750, 8751]);
    expect(stages.reduce((sum, stage) => sum + stage.amount, 0)).toBe(12_501);
    expect(stages.reduce((sum, stage) => sum + stage.days, 0)).toBe(15);
  });

  it("не дає нульових етапів на малих значеннях і проходить перевірку прямої угоди", () => {
    const stages = splitAdvance(100, 1);
    expect(stages.every((stage) => stage.amount >= 1 && stage.days >= 1)).toBe(true);
    const performer = { id: "p1", name: "Іван", avatarIndex: 0, specialty: "", fop: false };
    expect(validateDraft({ requestId: "r", responseId: "x", performer, method: "direct", stages: splitAdvance(5000, 10) }, true)).toBeNull();
  });
});

import { qrPath } from "@/lib/deals/qr-path";
import { groupIban, requisitesText, transferPurpose } from "@/lib/deals/transfer";

describe("шлях QR і тексти переказу", () => {
  it("зливає темні модулі рядка в прямокутники", () => {
    expect(qrPath([[true, true, false, true], [false, false, false, false], [false, true, true, true]])).toBe("M0 0h2v1h-2zM3 0h1v1h-1zM1 2h3v1h-3z");
    expect(qrPath([[false, false]])).toBe("");
  });

  it("призначення містить номер угоди, а IBAN групується по 4", () => {
    expect(transferPurpose("#AB12")).toBe("Оплата за роботу, угода #AB12");
    expect(groupIban("UA213052990000026001234567890")).toBe("UA21 3052 9900 0002 6001 2345 6789 0");
  });

  it("текст для копіювання містить усі поля", () => {
    const text = requisitesText({ recipient: "ФОП Іваненко І.", iban: "UA21", taxCode: "1234567890" }, 1500, "Оплата");
    expect(text.split("\n")).toEqual(["Одержувач: ФОП Іваненко І.", "IBAN: UA21", "Код: 1234567890", "Сума: 1500.00 UAH", "Призначення: Оплата"]);
  });
});
