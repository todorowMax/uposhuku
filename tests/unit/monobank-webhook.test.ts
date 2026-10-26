import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { derSignatureToRaw, importSpkiPem, verifyWithKey } from "@/lib/monobank/webhook";

const makeKey = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const sign = (body: string) => createSign("SHA256").update(body).sign(privateKey).toString("base64");
  return { pem: publicKey.export({ type: "spki", format: "pem" }).toString(), sign };
};

const body = JSON.stringify({ invoiceId: "inv1", status: "hold", amount: 10000, modifiedDate: "2026-10-26T21:21:18Z" });

describe("підпис вебхука Monobank", () => {
  it("справжній підпис проходить", async () => {
    const { pem, sign } = makeKey();
    expect(await verifyWithKey(body, sign(body), await importSpkiPem(pem))).toBe(true);
  });

  it("змінене тіло не проходить", async () => {
    const { pem, sign } = makeKey();
    const key = await importSpkiPem(pem);
    expect(await verifyWithKey(body.replace("hold", "success"), sign(body), key)).toBe(false);
  });

  it("повторна серіалізація тіла ламає підпис: перевіряємо сирий текст", async () => {
    const { pem, sign } = makeKey();
    const key = await importSpkiPem(pem);
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);
    expect(await verifyWithKey(reserialized, sign(body), key)).toBe(false);
  });

  it("чужий ключ не проходить", async () => {
    const signer = makeKey();
    const other = makeKey();
    expect(await verifyWithKey(body, signer.sign(body), await importSpkiPem(other.pem))).toBe(false);
  });

  it("DER у 64 байти r||s: коротке r чи s доповнюється нулями, довге з ведучим нулем скорочується", () => {
    const der = (r: number[], s: number[]) => Uint8Array.from([0x30, 4 + r.length + s.length, 0x02, r.length, ...r, 0x02, s.length, ...s]);
    const raw = derSignatureToRaw(der([0x01], [0x00, 0xff, 0x02]));
    expect(raw).toHaveLength(64);
    expect(raw[31]).toBe(0x01);
    expect(raw[30]).toBe(0x00);
    expect(raw[62]).toBe(0xff);
    expect(raw[63]).toBe(0x02);
  });

  it("не-DER підпис відхиляється помилкою", () => {
    expect(() => derSignatureToRaw(Uint8Array.from([0x31, 0x00]))).toThrow();
  });

  it("довільні підписи різної довжини проходять (стрес на формат DER)", async () => {
    const { pem, sign } = makeKey();
    const key = await importSpkiPem(pem);
    for (let index = 0; index < 60; index += 1) {
      const text = `${body}-${index}`;
      expect(await verifyWithKey(text, sign(text), key)).toBe(true);
    }
  });
});
