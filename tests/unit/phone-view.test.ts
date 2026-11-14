// Чисті рішення клієнта про телефон (lib/phone/view.ts).

import { describe, expect, it } from "vitest";
import { phoneMenuNote, phoneSheetState, shouldPoll, showPhoneItem } from "@/lib/phone/view";

const base = { verified: false, starting: false, started: false, error: null };

describe("phoneSheetState", () => {
  it("за замовчуванням idle, після старту waiting", () => {
    expect(phoneSheetState(base)).toBe("idle");
    expect(phoneSheetState({ ...base, starting: true })).toBe("starting");
    expect(phoneSheetState({ ...base, started: true })).toBe("waiting");
  });
  it("помилка перебиває очікування, підтвердження перебиває все", () => {
    expect(phoneSheetState({ ...base, started: true, error: "Номер уже підтверджено" })).toBe("error");
    expect(phoneSheetState({ ...base, started: true, error: "x", verified: true })).toBe("verified");
  });
});

describe("меню й опитування", () => {
  it("пункт видно, коли потрібен або підтверджено", () => {
    expect(showPhoneItem({ required: false, verified: false })).toBe(false);
    expect(showPhoneItem({ required: true, verified: false })).toBe(true);
    expect(showPhoneItem({ required: false, verified: true })).toBe(true);
  });
  it("підпис за станом", () => {
    expect(phoneMenuNote({ verified: true })).toBe("підтверджено");
    expect(phoneMenuNote({ verified: false })).toBe("не підтверджено");
  });
  it("опитуємо лише в очікуванні відкритої шторки", () => {
    expect(shouldPoll(true, "waiting")).toBe(true);
    expect(shouldPoll(false, "waiting")).toBe(false);
    expect(shouldPoll(true, "idle")).toBe(false);
    expect(shouldPoll(true, "verified")).toBe(false);
  });
});
