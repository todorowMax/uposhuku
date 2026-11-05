import { describe, expect, it } from "vitest";
import { mentionsPaymentDetails } from "@/lib/chat/payment-hints";

describe("платіжні дані в чаті", () => {
  it("помічає номер картки з пробілами й без", () => {
    expect(mentionsPaymentDetails("кидайте на 4111 1111 1111 1111 дякую")).toBe(true);
    expect(mentionsPaymentDetails("4111111111111111")).toBe(true);
    expect(mentionsPaymentDetails("карта 4111-1111-1111-1111")).toBe(true);
  });

  it("не плутає довгі числа без контрольної суми Луна з карткою", () => {
    expect(mentionsPaymentDetails("замовлення 1234567890123456")).toBe(false);
    expect(mentionsPaymentDetails("зустрінемось о 14:30, бюджет 25000 грн")).toBe(false);
  });

  it("помічає український IBAN, у тому числі через пробіли", () => {
    expect(mentionsPaymentDetails("UA213052990000026001234567890")).toBe(true);
    expect(mentionsPaymentDetails("ua21 3052 9900 0002 6001 2345 6789 0")).toBe(true);
  });

  it("помічає адреси TRON та EVM", () => {
    expect(mentionsPaymentDetails("USDT: TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE")).toBe(true);
    expect(mentionsPaymentDetails("0x52908400098527886E0F7030069857D2E4169EE7")).toBe(true);
  });

  it("звичайний текст без підказки", () => {
    expect(mentionsPaymentDetails("Привіт! Коли зможете почати?")).toBe(false);
    expect(mentionsPaymentDetails("")).toBe(false);
  });
});
