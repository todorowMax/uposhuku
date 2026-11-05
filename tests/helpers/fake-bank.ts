// tests/helpers/fake-bank.ts
//
// Підміна fetch для Monobank: невеликий «банк» у пам'яті зі статусами рахунку. Тести керують статусами
// (`setStatus`) і помилками, а сам код ходить у банк як зазвичай. Усі виклики записуються в `calls`.

import { vi } from "vitest";

export interface BankInvoice {
  invoiceId: string;
  status: string;
  amount: number;
  modifiedDate: string;
  reference: string;
  finalAmount?: number;
}

export interface BankCall {
  path: string;
  body: Record<string, unknown> | undefined;
  token: string;
}

export const createFakeBank = () => {
  const invoices = new Map<string, BankInvoice>();
  const calls: BankCall[] = [];
  let tick = 0;
  let seq = 0;
  const state = {
    /** Помилка наступних викликів цього шляху: статус HTTP або "network". */
    fail: new Map<string, number | "network">(),
    /** Побічний ефект перед відмовою: «хтось інший уже виконує операцію». */
    beforeFail: null as null | ((invoiceId: string) => void),
    /** Отримувачі розщеплення, якими відповідає split-receiver/list (id, ІПН). */
    receivers: [] as { id: string; edrpou: string; name: string }[],
  };
  const stamp = () => `2026-11-05T10:${String(Math.floor(++tick / 60)).padStart(2, "0")}:${String(tick % 60).padStart(2, "0")}Z`;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  const handler = async (url: string, init: RequestInit): Promise<Response> => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace("/api/merchant/", "");
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ path, body, token: (init.headers as Record<string, string>)["X-Token"] });
    const failure = state.fail.get(path);
    if (failure) state.beforeFail?.(parsed.searchParams.get("invoiceId") ?? String(body?.invoiceId));
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure) return json(failure, { errCode: "bad", errText: "bank says no" });
    if (path === "split-receiver/list") return json(200, { list: state.receivers });
    if (path === "invoice/create") {
      const invoiceId = `inv-${++seq}`;
      const merchant = (body?.merchantPaymInfo ?? {}) as { reference?: string };
      invoices.set(invoiceId, { invoiceId, status: "created", amount: Number(body?.amount), modifiedDate: stamp(), reference: merchant.reference ?? "" });
      return json(200, { invoiceId, pageUrl: `https://pay.monobank.ua/${invoiceId}` });
    }
    const id = parsed.searchParams.get("invoiceId") ?? String(body?.invoiceId);
    const invoice = invoices.get(id);
    if (!invoice) return json(404, { errText: "not found" });
    if (path === "invoice/status") return json(200, invoice);
    if (path === "invoice/finalize") {
      invoice.status = "processing";
      invoice.finalAmount = Number(body?.amount ?? invoice.amount);
      invoice.modifiedDate = stamp();
      return json(200, { status: "processing" });
    }
    if (path === "invoice/cancel") {
      invoice.status = "reversed";
      invoice.modifiedDate = stamp();
      return json(200, { status: "success" });
    }
    return json(404, { errText: "unknown path" });
  };

  const fetchMock = vi.fn(handler);
  return {
    fetchMock,
    invoices,
    calls,
    state,
    /** Банк сам змінив рахунок (оплата, завершення фіналізації, прострочення). */
    setStatus: (invoiceId: string, status: string, extra: Partial<BankInvoice> = {}) => {
      const invoice = invoices.get(invoiceId)!;
      Object.assign(invoice, { status, modifiedDate: stamp(), ...extra });
      return { ...invoice };
    },
    last: (path: string) => calls.filter((call) => call.path === path).at(-1),
    count: (path: string) => calls.filter((call) => call.path === path).length,
    reset: () => {
      calls.length = 0;
      state.fail.clear();
      state.beforeFail = null;
      state.receivers = [];
    },
  };
};
