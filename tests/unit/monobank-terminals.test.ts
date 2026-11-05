import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Вебхук спільний для двох терміналів: підпис перевіряємо ключами обох, кеш ключів у кожного свій.

const makeTerminal = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return { keyBase64: Buffer.from(pem).toString("base64"), sign: (body: string) => createSign("SHA256").update(body).sign(privateKey).toString("base64") };
};

const body = JSON.stringify({ invoiceId: "inv1", status: "hold", amount: 10000, modifiedDate: "2026-11-05T10:00:00Z" });

let plain: ReturnType<typeof makeTerminal>;
let split: ReturnType<typeof makeTerminal>;
let keyFetches: string[];

beforeEach(() => {
  vi.resetModules();
  plain = makeTerminal();
  split = makeTerminal();
  keyFetches = [];
  process.env.MONOBANK_TOKEN = "plain-token";
  process.env.MONOBANK_SPLIT_TOKEN = "split-token";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const token = (init.headers as Record<string, string>)["X-Token"];
      keyFetches.push(token);
      return new Response(JSON.stringify({ key: token === "plain-token" ? plain.keyBase64 : split.keyBase64 }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MONOBANK_TOKEN;
  delete process.env.MONOBANK_SPLIT_TOKEN;
});

describe("підпис вебхука двох терміналів", () => {
  it("підпис терміналу розщеплення і звичайного терміналу проходять, чужий ключ ні", async () => {
    const { verifyWebhookSignature } = await import("@/lib/monobank/webhook");
    expect(await verifyWebhookSignature(body, plain.sign(body))).toBe(true);
    expect(await verifyWebhookSignature(body, split.sign(body))).toBe(true);
    expect(await verifyWebhookSignature(body, makeTerminal().sign(body))).toBe(false);
    expect(await verifyWebhookSignature(body.replace("hold", "success"), split.sign(body))).toBe(false);
  });

  it("кеші ключів роздільні: ключ одного терміналу не підміняє ключ іншого", async () => {
    const { verifyWebhookSignature } = await import("@/lib/monobank/webhook");
    await verifyWebhookSignature(body, split.sign(body));
    keyFetches.length = 0;
    // Другий виклик з тим самим підписом бере ключі з кешу і не ходить у банк.
    expect(await verifyWebhookSignature(body, split.sign(body))).toBe(true);
    expect(keyFetches).toEqual([]);
    expect(await verifyWebhookSignature(body, plain.sign(body))).toBe(true);
  });

  it("термінал без токена пропускається: лише plain працює, як до розщеплення", async () => {
    delete process.env.MONOBANK_SPLIT_TOKEN;
    const { verifyWebhookSignature } = await import("@/lib/monobank/webhook");
    expect(await verifyWebhookSignature(body, plain.sign(body))).toBe(true);
    expect(await verifyWebhookSignature(body, split.sign(body))).toBe(false);
    expect(keyFetches.every((token) => token === "plain-token")).toBe(true);
  });
});
