import { describe, expect, it } from "vitest";
import { SEND_ERROR_TEXTS, draftAfterSend, sendErrorText, statusOfError } from "@/lib/chat/send-result";

describe("результат відправки повідомлення", () => {
  it("після успіху з поля знімається лише надіслане, дописане за час запиту лишається", () => {
    expect(draftAfterSend("привіт", "привіт")).toBe("");
    expect(draftAfterSend("привіт ще одне", "привіт")).toBe(" ще одне");
    expect(draftAfterSend("привіт   ", "привіт")).toBe("");
    // Текст у полі змінили всередині надісланого: нічого не чіпаємо.
    expect(draftAfterSend("прибув", "привіт")).toBe("прибув");
    expect(draftAfterSend("", "привіт")).toBe("");
  });

  it("код відповіді дістається з помилки запиту, мережевий збій дає null", () => {
    expect(statusOfError(new Error("429"))).toBe(429);
    expect(statusOfError(new Error("409"))).toBe(409);
    expect(statusOfError(new TypeError("Failed to fetch"))).toBeNull();
    expect(statusOfError("429")).toBeNull();
  });

  it("текст помилки: 429, 409 і все інше", () => {
    expect(sendErrorText(429)).toBe(SEND_ERROR_TEXTS.rateLimit);
    expect(sendErrorText(409)).toBe(SEND_ERROR_TEXTS.otherSideGone);
    expect(sendErrorText(413)).toBe(SEND_ERROR_TEXTS.tooLong);
    expect(SEND_ERROR_TEXTS.tooLong).toContain("4000");
    expect(sendErrorText(500)).toBe(SEND_ERROR_TEXTS.generic);
    expect(sendErrorText(null)).toBe(SEND_ERROR_TEXTS.generic);
    expect(SEND_ERROR_TEXTS.generic).toContain("Текст лишився в полі");
  });
});
