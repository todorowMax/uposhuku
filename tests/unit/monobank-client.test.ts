import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBasket } from "@/lib/deals/basket";
import { quoteStage } from "@/lib/deals/price";
import { cancelInvoice, createInvoice, finalizeInvoice, getInvoiceStatus, listSplitReceivers, MonobankError } from "@/lib/monobank/client";

const basket = buildBasket(quoteStage(10_000, "ua"), { performer: "recv-p", platform: "recv-f" });

const respond = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> };
};

beforeEach(() => {
  process.env.MONOBANK_TOKEN = "test-token";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MONOBANK_TOKEN;
});

describe("клієнт Monobank", () => {
  it("рахунок з холдом: токен, X-Cms, тип платежу, корзина й сума збігаються", async () => {
    fetchMock.mockImplementation(() => respond(200, { invoiceId: "inv1", pageUrl: "https://pay.monobank.ua/inv1" }));
    const result = await createInvoice({ amount: basket.reduce((sum, item) => sum + item.sum, 0), reference: "stage-1", destination: "Етап", webHookUrl: "https://findlyfy.com/hook", hold: true, basketOrder: basket });
    expect(result).toEqual({ invoiceId: "inv1", pageUrl: "https://pay.monobank.ua/inv1" });
    const { url, init, body, headers } = lastCall();
    expect(url).toBe("https://api.monobank.ua/api/merchant/invoice/create");
    expect(init.method).toBe("POST");
    expect(headers["X-Token"]).toBe("test-token");
    expect(headers["X-Cms"]).toBe("findlyfy");
    expect(body.paymentType).toBe("hold");
    expect(body.ccy).toBe(980);
    expect(body.merchantPaymInfo.basketOrder).toHaveLength(40);
    expect(body.amount).toBe(basket.reduce((sum: number, item: { sum: number }) => sum + item.sum, 0));
  });

  it("без холду списання одразу, redirectUrl лише коли заданий", async () => {
    fetchMock.mockImplementation(() => respond(200, { invoiceId: "inv2", pageUrl: "p" }));
    await createInvoice({ amount: 100, reference: "r", destination: "d", webHookUrl: "w", hold: false, basketOrder: [] });
    expect(lastCall().body.paymentType).toBe("debit");
    expect(lastCall().body).not.toHaveProperty("redirectUrl");
  });

  it("статус: розбирає відповідь банку, ігнорує зайві поля", async () => {
    fetchMock.mockImplementation(() => respond(200, { invoiceId: "inv1", status: "hold", amount: 10000, modifiedDate: "2026-10-26T21:21:18Z", payMethod: "pan", paymentInfo: { fee: 131, rrn: "x" } }));
    const status = await getInvoiceStatus("inv1");
    expect(status.status).toBe("hold");
    expect(status.paymentInfo?.fee).toBe(131);
    expect(lastCall().url).toContain("invoiceId=inv1");
  });

  it("невідомий статус від банку не проходить мовчки", async () => {
    fetchMock.mockImplementation(() => respond(200, { invoiceId: "inv1", status: "teapot", amount: 1, modifiedDate: "d" }));
    await expect(getInvoiceStatus("inv1")).rejects.toThrow();
  });

  it("повна фіналізація йде без корзини, часткова з позиціями", async () => {
    fetchMock.mockImplementation(() => respond(200, { status: "success" }));
    await finalizeInvoice({ invoiceId: "inv1" });
    expect(lastCall().body).toEqual({ invoiceId: "inv1" });
    await finalizeInvoice({ invoiceId: "inv1", amount: 5000, items: basket.slice(0, 2) });
    expect(lastCall().body.items).toHaveLength(2);
    expect(lastCall().body.amount).toBe(5000);
  });

  it("скасування й повернення по позиціях", async () => {
    fetchMock.mockImplementation(() => respond(200, { status: "success" }));
    await cancelInvoice({ invoiceId: "inv1", extRef: "refund-1", amount: basket[0].sum, items: [basket[0]] });
    const { url, body } = lastCall();
    expect(url).toBe("https://api.monobank.ua/api/merchant/invoice/cancel");
    expect(body).toMatchObject({ invoiceId: "inv1", extRef: "refund-1", amount: basket[0].sum });
  });

  it("помилка банку несе код і текст: «order not finished» відрізняємо від збою мережі", async () => {
    fetchMock.mockImplementation(() => respond(404, { errCode: "1004", errText: "order not finished" }));
    const error = await cancelInvoice({ invoiceId: "inv1" }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MonobankError);
    expect((error as MonobankError).status).toBe(404);
    expect((error as MonobankError).code).toBe("1004");
    expect((error as MonobankError).message).toContain("order not finished");
  });

  it("не JSON у відповіді-помилці не ламає розбір", async () => {
    fetchMock.mockImplementation(() => respond(502, "Bad gateway"));
    const error = (await getInvoiceStatus("x").catch((reason: unknown) => reason)) as MonobankError;
    expect(error.status).toBe(502);
    expect(error.code).toBeNull();
  });

  it("отримувачі: id, ІПН й імʼя", async () => {
    fetchMock.mockImplementation(() => respond(200, { list: [{ id: "test_1", okpo: "1", edrpou: "1234567890", name: "Анна" }] }));
    expect(await listSplitReceivers()).toEqual([{ id: "test_1", edrpou: "1234567890", name: "Анна" }]);
  });

  it("без токена кидає зрозумілу помилку й не звертається до банку", async () => {
    delete process.env.MONOBANK_TOKEN;
    await expect(getInvoiceStatus("x")).rejects.toThrow(/MONOBANK_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
