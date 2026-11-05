import { beforeAll, describe, expect, it } from "vitest";
import { isValidTaxCode, isValidUaIban, looksLikeCardNumber, luhnOk, maskIban, normalizePayUrl, validateRequisites } from "@/lib/deals/requisites";
import { responseAuthor } from "@/lib/deals/parties";
import { openText, sealText, SecretBoxUnavailableError } from "@/lib/server/secret-box";

// Справжній за контрольною сумою UA IBAN для тестів (МФО 305299, рахунок з нулів і одиниці).
const buildIban = (account: string): string => {
  const body = `305299${account.padStart(19, "0")}`;
  const digits = (body + "3010" + "00").replace(/\D/g, "");
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return `UA${String(98 - rest).padStart(2, "0")}${body}`;
};
const IBAN = buildIban("26001234567");

describe("IBAN і картка", () => {
  it("приймає вірний український IBAN і відхиляє зіпсований", () => {
    expect(IBAN).toHaveLength(29);
    expect(isValidUaIban(IBAN)).toBe(true);
    expect(isValidUaIban(IBAN.toLowerCase().replace(/(.{4})/g, "$1 "))).toBe(true);
    const broken = `${IBAN.slice(0, 28)}${(Number(IBAN[28]) + 1) % 10}`;
    expect(isValidUaIban(broken)).toBe(false);
    expect(isValidUaIban(IBAN.slice(0, 28))).toBe(false);
    expect(isValidUaIban("DE89370400440532013000")).toBe(false);
  });

  it("номер картки (Лун) не приймається ні в якому вигляді", () => {
    expect(luhnOk("4111111111111111")).toBe(true);
    expect(looksLikeCardNumber("4111 1111 1111 1111")).toBe(true);
    expect(looksLikeCardNumber("4111-1111-1111-1112")).toBe(false);
    const result = validateRequisites({ recipient: "ФОП Іваненко Іван", iban: "4111 1111 1111 1111", taxCode: "1234567890" });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/IBAN/);
  });

  it("маска лишає перші 4 й останні 4 символи", () => {
    const mask = maskIban(IBAN);
    expect(mask.startsWith(IBAN.slice(0, 4))).toBe(true);
    expect(mask.endsWith(IBAN.slice(-4))).toBe(true);
    expect(mask).not.toContain(IBAN.slice(8, 20));
  });
});

describe("інші поля", () => {
  it("код 8 або 10 цифр", () => {
    expect(isValidTaxCode("12345678")).toBe(true);
    expect(isValidTaxCode("1234567890")).toBe(true);
    expect(isValidTaxCode("123456789")).toBe(false);
    expect(isValidTaxCode("12345678ab")).toBe(false);
  });

  it("посилання на оплату: https і хости зі списку", () => {
    expect(normalizePayUrl("https://send.monobank.ua/jar/abc")).toBe("https://send.monobank.ua/jar/abc");
    expect(normalizePayUrl("https://www.privat24.ua/send/x")).toBeTruthy();
    expect(normalizePayUrl("http://send.monobank.ua/jar/abc")).toBeNull();
    expect(normalizePayUrl("https://send.monobank.ua.evil.com/jar")).toBeNull();
    expect(normalizePayUrl("https://user:pw@send.monobank.ua/jar")).toBeNull();
    expect(normalizePayUrl("https://send.monobank.ua:8443/jar")).toBeNull();
    expect(normalizePayUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePayUrl("https://example.com")).toBeNull();
  });

  it("валідація збирає нормалізоване значення й вимагає одержувача 2–100 символів", () => {
    const ok = validateRequisites({ recipient: "  ФОП   Іваненко І. ", iban: IBAN.toLowerCase(), taxCode: "1234 567890", payUrl: "" });
    expect(ok).toEqual({ ok: true, value: { recipient: "ФОП Іваненко І.", iban: IBAN, taxCode: "1234567890" } });
    expect(validateRequisites({ recipient: "І", iban: IBAN, taxCode: "12345678" })).toMatchObject({ ok: false });
    expect(validateRequisites({ recipient: "x".repeat(101), iban: IBAN, taxCode: "12345678" })).toMatchObject({ ok: false });
    expect(validateRequisites({ recipient: "Іван", iban: IBAN, taxCode: "12345678", payUrl: "https://evil.example" })).toMatchObject({ ok: false });
    expect(validateRequisites(null)).toMatchObject({ ok: false });
  });

  it("id відгуку зв'язаний із запитом", () => {
    expect(responseAuthor("req_1", "resp_req_1_user-a")).toBe("user-a");
    expect(responseAuthor("req_1", "resp_req_2_user-a")).toBeNull();
    expect(responseAuthor("req_1", "resp_req_1_")).toBeNull();
    expect(responseAuthor("", "resp__x")).toBeNull();
  });
});

describe("secret-box", () => {
  beforeAll(() => {
    process.env.REQUISITES_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("шифрує й розшифровує з тим самим власником, чужого aad не пускає", async () => {
    const sealed = await sealText("secret-iban", "user-a");
    expect(sealed).not.toContain("secret-iban");
    expect(sealed.startsWith("1.")).toBe(true);
    expect(await openText(sealed, "user-a")).toBe("secret-iban");
    await expect(openText(sealed, "user-b")).rejects.toThrow();
    // Той самий текст щоразу дає інший шифротекст (випадковий IV).
    expect(await sealText("secret-iban", "user-a")).not.toBe(sealed);
  });

  it("без ключа або з ключем не тієї довжини кидає SecretBoxUnavailableError", async () => {
    const saved = process.env.REQUISITES_KEY;
    delete process.env.REQUISITES_KEY;
    await expect(sealText("x", "u")).rejects.toBeInstanceOf(SecretBoxUnavailableError);
    process.env.REQUISITES_KEY = Buffer.alloc(16, 1).toString("base64");
    await expect(sealText("x", "u")).rejects.toBeInstanceOf(SecretBoxUnavailableError);
    process.env.REQUISITES_KEY = saved;
  });
});
