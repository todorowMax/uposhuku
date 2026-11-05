import { describe, expect, it } from "vitest";
import { formatQrAmount, NBU_QR_BASE, nbuQrLines, nbuQrLink } from "@/lib/deals/nbu-qr";

const input = { recipient: "ФОП Іваненко Іван", iban: "ua 213052 990000026001234567890".replace(/ /g, ""), taxCode: "1234 567890", amount: 1500, purpose: "Оплата за роботу, угода #AB12" };

const decode = (link: string) => {
  const base64 = link.slice(NBU_QR_BASE.length).replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)));
};

describe("QR за форматом НБУ", () => {
  it("рядки йдуть у порядку формату, порожні лишаються на місці", () => {
    const lines = nbuQrLines(input);
    expect(lines).toHaveLength(12);
    expect(lines.slice(0, 5)).toEqual(["BCD", "002", "2", "UCT", ""]);
    expect(lines[5]).toBe("ФОП Іваненко Іван");
    expect(lines[6]).toBe("UA213052990000026001234567890");
    expect(lines[7]).toBe("UAH1500.00");
    expect(lines[8]).toBe("1234567890");
    expect(lines.slice(9, 11)).toEqual(["", ""]);
    expect(lines[11]).toBe("Оплата за роботу, угода #AB12");
  });

  it("посилання: base64url без `=` і зворотно розкривається в ті самі рядки", () => {
    const link = nbuQrLink(input);
    expect(link.startsWith(NBU_QR_BASE)).toBe(true);
    expect(link.slice(NBU_QR_BASE.length)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decode(link)).toBe(nbuQrLines(input).join("\n"));
  });

  it("переводи рядків у полях не ламають розкладку", () => {
    const lines = nbuQrLines({ ...input, recipient: "Іван\nІваненко", purpose: "а\r\nб" });
    expect(lines).toHaveLength(12);
    expect(lines[5]).toBe("Іван Іваненко");
    expect(lines[11]).toBe("а б");
  });

  it("сума з двома знаками", () => {
    expect(formatQrAmount(30)).toBe("UAH30.00");
    expect(formatQrAmount(99.5)).toBe("UAH99.50");
  });
});
